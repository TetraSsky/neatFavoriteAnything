/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

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
import { FavouriteItem, FavouriteItemFormat } from "./types";
import { cl, encodeAttachment, useFavourites, useListScroller, useResizeObserver } from "./utils";

export const ListScroller = ListScrollerThin as ComponentType<
    Omit<ComponentProps<typeof ListScrollerThin>, "rowHeight"> & {
        rowHeight?: number | ((section: number, row: number) => number);
    }
>;

export interface FavoriteButtonProps extends Omit<FavouriteItem, "order"> {
    url: string;
    className?: string;
}

export const FavoriteButton = findComponentByCodeLazy<FavoriteButtonProps>("#{intl::GIF_TOOLTIP_ADD_TO_FAVORITES}");

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

    // TODO: Add empty section rendered when favs are empty
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
                return (
                    <div className={cl("scroller-footer")}>
                        <img src="https://media.discordapp.net/stickers/1039992459209490513.png" />
                    </div>
                );
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
            <div className={cl("container-body")}>
                <ListScroller
                    sections={[count, 1]}
                    sectionHeight={0}
                    rowHeight={(section, row) => (section === 1 ? 200 : (rowHeights.current[row] ?? 100))}
                    renderSection={() => null}
                    renderRow={({ section, row }) => renderRow(section, row)}
                />
            </div>
        </div>
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

    const { image, video, thumbnail } = embed ?? {};
    const content = video ?? image;

    if (!embed || !content || embed.type === "gifv") return null;

    return (
        <div className={cl("image-accessory")}>
            <FavoriteButton
                {...content}
                className={Classes.gifFavoriteButton}
                format={video?.proxyURL ? FavouriteItemFormat.VIDEO : FavouriteItemFormat.IMAGE}
                url={(video?.proxyURL && content?.url) || embed.url!}
                src={video?.proxyURL ?? thumbnail?.proxyURL ?? content.url}
            />
        </div>
    );
}

export function AttachmentAccessory() {
    const attachment = React.useContext(AttachmentContext);

    const { originalItem, type, downloadUrl, width, height, srcIsAnimated } = attachment ?? {};
    const isVisualMedia = type === "IMAGE" || type === "VIDEO";

    const src = useMemo(() => {
        if (!originalItem) return null;
        return isVisualMedia ? originalItem.proxy_url : encodeAttachment(originalItem)?.toString();
    }, [isVisualMedia, originalItem]);

    if (!src || !downloadUrl || srcIsAnimated) return null;

    return isVisualMedia ? (
        <FavoriteButton
            format={type === "VIDEO" ? FavouriteItemFormat.VIDEO : FavouriteItemFormat.IMAGE}
            url={downloadUrl}
            src={src}
            width={width!}
            height={height!}
        />
    ) : (
        <FavoriteButton format={FavouriteItemFormat.NONE} url={downloadUrl} src={src} width={600} height={400} />
    );
}

export interface EmbedComponent extends Component<{ embed: Embed }> {
    __render: () => ReactNode;
}
