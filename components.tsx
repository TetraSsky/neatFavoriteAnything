/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Channel, Embed, Message, MessageAttachment, TextInput } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import {
    findByCode,
    findByProps,
    findComponentByCode,
    findComponentByCodeLazy,
    findCssClassesLazy,
    proxyLazyWebpack
} from "@webpack";
import { ListScrollerThin, React, useEffect, useMemo, useRef, useStateFromStores } from "@webpack/common";
import { Component, ComponentClass, ComponentProps, ComponentPropsWithRef, ComponentType, ReactNode } from "react";

import { AttachmentContext, EmbedContext } from ".";
import { AttachmentUrlsStore } from "./stores";
import { AttachmentItem, FavouriteItem, FavouriteItemFormat } from "./types";
import { cl, encodeAttachment, ImageUtils, useFavourites, useListScroller, useResizeObserver } from "./utils";

const ListScroller = ListScrollerThin as ComponentType<
    Omit<ComponentProps<typeof ListScrollerThin>, "rowHeight"> & {
        rowHeight?: number | ((section: number, row: number) => number);
    }
>;

interface FavoriteButtonProps extends Omit<FavouriteItem, "order"> {
    url: string;
    className?: string;
}

const FavoriteButton = findComponentByCodeLazy<FavoriteButtonProps>("#{intl::GIF_TOOLTIP_ADD_TO_FAVORITES}");

// Partial type, renderAttachments only uses a few props
interface MessageComponentProps {
    message: Message;
    channel: Channel;
    gifAutoPlay?: boolean;
    canDeleteAttachments?: boolean;
    shouldHideMediaOptions?: boolean;
    inlineAttachmentMedia?: boolean;
}

export interface MessageComponentClass extends Omit<ComponentClass<MessageComponentProps>, "new"> {
    new (props: MessageComponentProps): Component<MessageComponentProps> & {
        renderAttachments(message: Partial<Message>): ReactNode;
    };
}

interface AttachmentsComponentProps {
    attachments: MessageAttachment[];
}

export const Attachments = proxyLazyWebpack(() => {
    const MessageComponent = findComponentByCode("this.renderAttachments") as MessageComponentClass;

    const DmChannel: Channel & { new (base?: Partial<Channel>): Channel } = findByProps("fromServer", "sortRecipients");
    const MessageClass: Message & { new (base?: Partial<Message>): Message } = findByCode("this.firstEditTimestamp");

    class MessageAttachmentsComponent extends MessageComponent {
        render(): ReactNode {
            return this.renderAttachments(this.props.message);
        }
    }

    const channel = Object.freeze(new DmChannel({ id: "0", type: ChannelType.GUILD_TEXT }));

    return function Attachments({ attachments }: AttachmentsComponentProps) {
        const message = useMemo(() => new MessageClass({ attachments, channel_id: channel.id }), [attachments]);

        return (
            <MessageAttachmentsComponent
                channel={channel}
                message={message}
                canDeleteAttachments={false}
                shouldHideMediaOptions={false}
                inlineAttachmentMedia
            />
        );
    };
});

interface ManaSearchBarProps extends Pick<
    ComponentPropsWithRef<TextInput>,
    "autoFocus" | "placeholder" | "onKeyDown" | "disabled" | "onChange" | "onBlur" | "onFocus" | "autoComplete" | "ref"
> {
    query?: string;
    onClear?: () => void;
    inputProps?: ComponentProps<TextInput>;
}

export const ManaSearchBar = findComponentByCodeLazy<ManaSearchBarProps>("#{intl::SEARCH}),ref");

export function FilePicker() {
    const [favs, query, setQuery] = useFavourites();
    const count = useMemo(() => (favs ? Object.keys(favs).length : 0), [favs]);
    const [rowHeights, handleResize] = useListScroller(count);

    const renderRow = (section: number, row: number) => {
        switch (section) {
            case 0: {
                const item = favs?.[row];
                if (!item) return null;

                return (
                    <FilePickerItem key={item.url} url={item.url} file={item.src} row={row} onResize={handleResize} />
                );
            }
            case 1: {
                return <div className={cl("scroller-footer")} />;
            }
        }
    };

    return (
        <div id="files-picker-tab-panel" role="tabpanel" aria-labelledby="files-picker-tab" className={cl("container")}>
            <div className={cl("container-header")}>
                <ManaSearchBar
                    autoFocus
                    placeholder="Search files"
                    query={query}
                    onChange={setQuery}
                    onClear={() => setQuery("")}
                />
            </div>
            {count > 0 ? (
                <div className={cl("container-body")}>
                    <ListScroller
                        sections={[count, 1]}
                        sectionHeight={0}
                        rowHeight={(section, row) => (section === 1 ? 12 : (rowHeights.current[row] ?? 100))}
                        renderSection={() => null}
                        renderRow={({ section, row }) => renderRow(section, row)}
                    />
                </div>
            ) : (
                <div className={cl("container-body", "container-info")} inert>
                    {query.trim() ? <EmptyList /> : <Demo />}
                </div>
            )}
        </div>
    );
}

function EmptyList() {
    return <BaseText className={cl("info-text")}>No files match your search.</BaseText>;
}

const demoAttachment: MessageAttachment = {
    id: "1",
    filename: "file",
    content_type: "application/octet-stream",
    size: 123 * 1024,
    spoiler: false,
    url: "",
    proxy_url: ""
};

function Demo() {
    return (
        <>
            <div className={cl("attachment-container", "demo")}>
                <Attachments attachments={[demoAttachment]} />
                <FavoriteButton
                    className={cl("demo-favourite-button")}
                    url="https://example.org"
                    src="https://example.org"
                    width={100}
                    height={100}
                    format={FavouriteItemFormat.NONE}
                />
            </div>
            <BaseText className={cl("info-text")}>
                Click the star to favourite a file.
                <br />
                Favourite files will show up here!
            </BaseText>
        </>
    );
}

interface FilePickerItemProps {
    row: number;
    url: string;
    file: MessageAttachment;
    onResize: (row: number, height: number) => void;
}

export function FilePickerItem({ row, file, onResize }: FilePickerItemProps) {
    // TODO: Add send/upload button
    const ref = useRef<HTMLDivElement>(null);
    const height = useResizeObserver(ref);
    useEffect(() => void (height && onResize(row, height)), [row, height]);

    const attachments = useStateFromStores(
        [AttachmentUrlsStore],
        () => {
            const attachment = {
                ...file,
                url: AttachmentUrlsStore.get(file.url),
                proxy_url: AttachmentUrlsStore.get(file.proxy_url)
            };
            return [attachment as MessageAttachment];
        },
        [file]
    );

    return (
        <div ref={ref} className={cl("attachment-container")}>
            <Attachments attachments={attachments} />
        </div>
    );
}

const Classes = findCssClassesLazy("gifFavoriteButton", "ctaButtonContainer");

export function EmbedAccessory() {
    const embed = React.useContext(EmbedContext);

    const props: FavoriteButtonProps | null = useMemo(() => {
        if (!embed) return null;

        const { image, video, thumbnail, type } = embed;
        const content = video ?? image;
        if (!content) return null;

        const isProxiedVideo = !!video?.proxyURL;
        const src = content?.proxyURL ?? thumbnail?.proxyURL ?? content.url;
        const url = !video || isProxiedVideo ? content?.url : embed.url!;
        const format = isProxiedVideo ? FavouriteItemFormat.VIDEO : FavouriteItemFormat.IMAGE;

        const isAnimated = ImageUtils.isAnimated({ original: url, src, animated: type === "gifv" });
        if (isAnimated) return null;

        return { format, src, url, width: content.width, height: content.height };
    }, [embed]);

    return (
        props && (
            <div className={cl("image-accessory")}>
                <FavoriteButton {...props} className={Classes.gifFavoriteButton} />
            </div>
        )
    );
}

const itemFormats: Partial<Record<AttachmentItem["type"], FavouriteItemFormat>> = Object.freeze({
    IMAGE: FavouriteItemFormat.IMAGE,
    VIDEO: FavouriteItemFormat.VIDEO
});

export function AttachmentAccessory() {
    const attachment = React.useContext(AttachmentContext);

    const props: FavoriteButtonProps | null = useMemo(() => {
        if (!attachment) return null;
        const { originalItem, type, downloadUrl, width = 600, height = 400, srcIsAnimated } = attachment;

        const isAnimated = ImageUtils.isAnimated({
            original: originalItem.url,
            src: originalItem.proxy_url,
            animated: false,
            srcIsAnimated
        });
        if (isAnimated) return null;

        const isVisualMedia = type === "IMAGE" || type === "VIDEO" || type === "CLIP";
        const src = isVisualMedia ? originalItem.proxy_url : encodeAttachment(originalItem)?.toString();
        if (!src) return null;

        const format = (type && itemFormats[type]) || FavouriteItemFormat.NONE;

        return { format, src, url: downloadUrl, width, height };
    }, [attachment]);

    return props && <FavoriteButton {...props} className={cl("attachment-accessory")} />;
}

export interface EmbedComponent extends Component<{ embed: Embed }> {
    __render: () => ReactNode;
}
