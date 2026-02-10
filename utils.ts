/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { Queue } from "@utils/Queue";
import { useForceUpdater } from "@utils/react";
import { PluginNative } from "@utils/types";
import { Channel, MessageAttachment } from "@vencord/discord-types";
import { DraftType } from "@vencord/discord-types/enums";
import { findByPropsLazy } from "@webpack";
import {
    Constants,
    RestAPI,
    UploadHandler,
    useCallback,
    useEffect,
    useRef,
    UserSettingsActionCreators,
    UserSettingsProtoStore,
    useState,
    useStateFromStores
} from "@webpack/common";
import { deflateSync, inflateSync } from "fflate";
import { RefObject } from "react";

import {
    CustomItemDef,
    CustomItemFormat,
    FavouriteItem,
    FavouriteItemFormat,
    FileUploadOptions,
    ItemsDef,
    UnfurledEmbedsResponse
} from "./types";

export const cl = classNameFactory("vc-favouriteAnything-");

const defineItem = <const A, const B>(item: CustomItemDef<A, B>) => item;
function defineItems<T extends Record<CustomItemFormat, CustomItemDef>>(def: ItemsDef<T>) {
    type Type<F extends CustomItemFormat> = T[F] extends CustomItemDef<infer A> ? A : never;

    return {
        encode: <F extends CustomItemFormat>(format: F, data: Type<F>) => {
            try {
                const obj = [format, def[format].encode(data)];

                const buf = deflateSync(new TextEncoder().encode(JSON.stringify(obj)));
                return buf.toBase64({ alphabet: "base64url", omitPadding: true });
            } catch {
                return null;
            }
        },
        decode: (raw: string) => {
            try {
                if (!raw) return null;

                const buf = inflateSync(Uint8Array.fromBase64(raw, { alphabet: "base64url" }));
                const parsed: unknown[] | null = JSON.parse(new TextDecoder().decode(buf));
                if (!Array.isArray(parsed)) return null;

                const [format, data] = parsed as [keyof typeof def, unknown];
                if (!(format in def)) return null;

                return { format, data: def[format].decode(data) } as {
                    [F in CustomItemFormat]: { format: F; data: Type<F> };
                }[CustomItemFormat];
            } catch {
                return null;
            }
        },
        stringify: <F extends CustomItemFormat>(format: F, item: Type<F>) => def[format].stringify(item)
    };
}

export const defs = defineItems({
    [CustomItemFormat.ATTACHMENT]: defineItem({
        encode: ({ id, filename, size, url, content_type = "" }: MessageAttachment) => [
            id,
            filename,
            size,
            new URL(url).pathname,
            content_type
        ],
        decode: ([id, filename, size, path, content_type]) => ({
            id: `${id}`,
            filename: `${filename}`,
            size: +size! || 0,
            url: `${new URL(path!, `https://${window.GLOBAL_ENV.CDN_HOST}`)}`,
            proxy_url: `${new URL(path!, `https://${window.GLOBAL_ENV.MEDIA_PROXY_ENDPOINT}`)}`,
            content_type: `${content_type}`,
            spoiler: false
        }),
        stringify: ({ filename }) => filename
    })
});

// TODO: replace with something nicer looking idk
const fallbackThumbnail =
    "https://images-ext-1.discordapp.net/external/S4K7rlM4DWPFINDZKKmlrGGi3ULoMG4R6rcwRlQz8LU/%3Ftext%3Dinvalid/https/placehold.jp/42/444/fff/600x400.png";

export async function getThumbnailUrl(data: string): Promise<URL | null> {
    try {
        const decoded = defs.decode(data);
        if (!decoded) return null;

        const text = defs.stringify(decoded.format, decoded.data);
        const url = new URL("https://placehold.jp/42/444/fff/600x400.png");
        url.searchParams.append("text", text);

        return await RestAPI.post({
            url: Constants.Endpoints.UNFURL_EMBED_URLS,
            body: { urls: [url] },
            retries: 3
        }).then(({ body }: { body: UnfurledEmbedsResponse }) => {
            const [{ thumbnail } = {}] = body.embeds;
            return new URL(thumbnail?.proxy_url ?? fallbackThumbnail);
        });
    } catch {
        return new URL(fallbackThumbnail);
    }
}

const Native = VencordNative.pluginHelpers.FavouriteAnything as PluginNative<typeof import("./native")>;

const promptToUpload = UploadHandler.promptToUpload as (
    files: File[],
    channel: Channel,
    draftType: DraftType,
    options?: FileUploadOptions
) => void | Promise<void>;

export async function reuploadAttachment(attachment: MessageAttachment, channel: Channel, options?: FileUploadOptions) {
    return await Native.fetchAttachment(attachment)
        .then(({ data, filename, type }) => new File([data], filename, { type }))
        .then(file => ({ upload: promptToUpload([file], channel, DraftType.ChannelMessage, options) }))
        .catch(() => ({ upload: null }));
}

export function useResizeObserver<T extends HTMLElement = HTMLElement>(ref: RefObject<T | null>): number {
    const [height, setHeight] = useState<number>(0);

    useEffect(() => {
        if (!ref.current) return;

        const observer = new ResizeObserver(([{ borderBoxSize }]) => {
            const [{ blockSize }] = borderBoxSize;
            setHeight(blockSize);
        });

        observer.observe(ref.current, { box: "border-box" });

        return () => observer.disconnect();
    }, [ref]);

    return height;
}

function normalize(str: string) {
    return str.normalize("NFKC").toLowerCase().trim();
}

export function useFavourites(itemFormat: CustomItemFormat, searchQuery?: string) {
    useEffect(() => void UserSettingsActionCreators.FrecencyUserSettingsActionCreators.loadIfNecessary(), []);

    const { state } = useStateFromStores(
        [UserSettingsProtoStore],
        () => {
            const query = searchQuery && normalize(searchQuery);
            const items: Record<string, FavouriteItem> | null =
                UserSettingsProtoStore.frecencyWithoutFetchingLatest.favoriteGifs?.gifs;
            if (!items) return { query, state: null };

            const validItems = Object.entries(items)
                .filter(([, { format }]) => format === FavouriteItemFormat.NONE)
                .map(([url, { src, ...rest }]) => ({
                    ...rest,
                    ...defs.decode(URL.parse(src)?.hash.replace("#", "") ?? "")!,
                    url
                }))
                .filter(({ format, data }) => data && format === itemFormat);

            const filtered = query
                ? validItems.filter(({ format, data }) => normalize(defs.stringify(format, data)).includes(query))
                : validItems;

            return { query, state: filtered.sort((a, b) => b.order - a.order) };
        },
        [searchQuery],
        // Do not rerender components using this hook unless the query has changed or the items were loaded for the first time
        // This matches the behavior of the gif picker, where unfavouriting an item doesn't immediately hide it
        (prev, next) => !!prev.state === !!next.state && prev.query === next.query
    );

    return state;
}

export function useListScroller(count: number) {
    const rowHeights = useRef<number[]>([]);
    const update = useForceUpdater();

    useEffect(() => {
        if (count === rowHeights.current.length) return;

        rowHeights.current = new Array(count);
        update();
    }, [count]);

    const handleResize = useCallback((row: number, height: number) => {
        if (height === rowHeights.current[row]) return;

        rowHeights.current[row] = height;
        update();
    }, []);

    return [rowHeights, handleResize] as const;
}

export class BatchedRequestQueue<T> {
    private items: T[] = [];
    private timer: NodeJS.Timeout | null = null;
    private readonly queue: Queue = new Queue();

    constructor(
        private readonly cb: (items: T[]) => Promise<void>,
        private readonly options: { maxCount: number; timeout?: number }
    ) {}

    add(item: T) {
        if (this.items.indexOf(item) !== -1) return;
        this.items.push(item);

        if (this.items.length >= this.options.maxCount) {
            this.flush();
        } else {
            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(() => this.flush(), this.options.timeout);
        }
    }

    private flush() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;

        if (this.items.length === 0) return;

        const batch = this.items.splice(0, 50);
        this.queue.push(() => this.cb(batch).catch(() => this.items.push(...batch)));
    }
}

interface ImageUtils {
    isAnimated(image: { src: string; original?: string; animated: boolean; srcIsAnimated?: boolean }): boolean;
}

export const ImageUtils: ImageUtils = findByPropsLazy("isAnimated", "getFormatQuality");
