/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { Queue } from "@utils/Queue";
import { useForceUpdater } from "@utils/react";
import { MessageAttachment } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import {
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

import { EncodedItem, FavouriteItem, FavouriteItemFormat } from "./types";

export const cl = classNameFactory("vc-favouriteAnything-");

export function encodeAttachment(attachment: MessageAttachment): URL | null {
    try {
        const obj: EncodedItem = [
            attachment.id,
            attachment.filename,
            attachment.size,
            new URL(attachment.url).pathname,
            attachment.content_type ?? ""
        ];

        const buf = deflateSync(new TextEncoder().encode(JSON.stringify(obj)));

        // TODO: Replace with proper thumbnails
        const url = new URL(
            "https://images-ext-1.discordapp.net/external/1bdEiJ7hceqFJZJF6nIJFkL1Eyz0KlRp0ATBcM5vfh8/https/1.1.1.1/media/social-share.png?format=webp&quality=lossless&width=800&height=468"
        );
        url.search = "";
        url.hash = buf.toBase64({ alphabet: "base64url", omitPadding: true });

        return url;
    } catch {
        return null;
    }
}

export function decodeAttachment(url: URL | null): MessageAttachment | null {
    if (!url) return null;

    try {
        const buf = Uint8Array.fromBase64(url.hash.replace("#", ""), { alphabet: "base64url" });
        const data = new TextDecoder().decode(inflateSync(buf));
        const parsed: Partial<EncodedItem> | null = JSON.parse(data);
        if (!Array.isArray(parsed)) return null;

        const [id, filename, size, path, content_type] = parsed;

        return {
            id: `${id}`,
            filename: `${filename}`,
            size: +size! || 0,
            url: `${new URL(path!, `https://${window.GLOBAL_ENV.CDN_HOST}`)}`,
            proxy_url: `${new URL(path!, `https://${window.GLOBAL_ENV.MEDIA_PROXY_ENDPOINT}`)}`,
            content_type: `${content_type}`,
            spoiler: false
        };
    } catch {
        return null;
    }
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

export function useFavourites() {
    useEffect(() => void UserSettingsActionCreators.FrecencyUserSettingsActionCreators.loadIfNecessary(), []);
    const [searchQuery, setSearchQuery] = useState("");

    const { state } = useStateFromStores(
        [UserSettingsProtoStore],
        () => {
            const query = normalize(searchQuery);
            const items: Record<string, FavouriteItem> | null =
                UserSettingsProtoStore.frecencyWithoutFetchingLatest.favoriteGifs?.gifs;
            if (!items) return { query, state: null };

            const attachments = Object.entries(items)
                .filter(([, { format }]) => format === FavouriteItemFormat.NONE)
                .map(([url, { src, ...rest }]) => ({ ...rest, url, src: decodeAttachment(URL.parse(src))! }))
                .filter(({ src }) => src);

            const filtered = query
                ? attachments.filter(item => normalize(item.src.filename).includes(query))
                : attachments;

            return { query, state: filtered.sort((a, b) => b.order - a.order) };
        },
        [searchQuery],
        // Do not rerender components using this hook unless the query has changed or the items were loaded for the first time
        // This matches the behavior of the gif picker, where unfavouriting an item doesn't immediately hide it
        (prev, next) => !!prev.state === !!next.state && prev.query === next.query
    );

    return [state, searchQuery, setSearchQuery] as const;
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
