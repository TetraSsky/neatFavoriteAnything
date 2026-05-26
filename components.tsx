/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { LazyComponentWrapper } from "@utils/lazyReact";
import { Message } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { findByCodeLazy, findComponentByCode, findComponentByCodeLazy, findCssClassesLazy, proxyLazyWebpack } from "@webpack";
import { ChannelStore, ExpressionPickerStore, ListScrollerThin, lodash, PermissionsBits, PermissionStore, React, useCallback, useEffect, useMemo, useRef, useState, useStateFromStores } from "@webpack/common";
import { ComponentProps, ComponentType, ReactNode, Ref } from "react";

import { AttachmentContext, EmbedContext, EmbedMosaicContext } from ".";
import { SignedUrlsStore } from "./stores";
import { AttachmentItem, AttachmentsComponentProps, CustomItemFormat, FavoriteButtonProps, FavouriteItemFormat, FilePickerItemProps, FilePickerProps, FullMessageAttachment, ManaSearchBarProps, MessageComponentClass, ScrollerBaseRef } from "./types";
import { cl, defs, hasPermission, ImageUtils, isDirectVideoFile, markExternalVideoSrc, markStaticImageSrc, sendAttachment, stripExternalVideoMarker, useFavourites, useImageFavourites, useListScroller, useResizeObserver, useVirtualizedMasonry, useVideoFavourites } from "./utils";

const ManaSearchBar = findComponentByCodeLazy<ManaSearchBarProps>("#{intl::SEARCH}),ref");
const FavoriteButton = findComponentByCodeLazy<FavoriteButtonProps>("#{intl::GIF_TOOLTIP_ADD_TO_FAVORITES}");
const SendIcon = findComponentByCodeLazy("M6.6 10.02 14 11.4a.6.6");

const createChannelRecordFromServer = findByCodeLazy(".GUILD_TEXT]", "fromServer)");
const createMessageRecord = findByCodeLazy(".createFromServer(", ".isBlockedForMessage", "messageReference:");

const Classes = findCssClassesLazy("gifFavoriteButton", "ctaButtonContainer");
const ScrollerClasses = findCssClassesLazy("thin", "scrollerBase", "fade");
const GifPickerClasses = findCssClassesLazy("result", "endContainer");

const ListScroller = ListScrollerThin as ComponentType<
    Omit<ComponentProps<typeof ListScrollerThin>, "rowHeight" | "ref"> & {
        rowHeight?: number | ((section: number, row: number) => number);
        ref?: Ref<ScrollerBaseRef>;
    }
>;

function createPreviewMessage(attachment: FullMessageAttachment, channelId: string) {
    const previewMessage = {
        id: `favourite-anything-preview-${attachment.id}`,
        attachments: [attachment],
        channel_id: channelId,
        content: "",
        type: 0,
        timestamp: new Date().toISOString()
    };

    return createMessageRecord(previewMessage) as Message;
}

export const AttachmentPreview = proxyLazyWebpack(() => {
    // findComponentByCodeLazy doesn't work properly with component classes, this must be kept within the lazy scope
    const MessageComponent = findComponentByCode("this.renderAttachments") as LazyComponentWrapper<MessageComponentClass>;

    class MessageAttachmentsComponent extends MessageComponent {
        render(): ReactNode {
            return this.renderAttachments(this.props.message);
        }
    }

    const channel = Object.freeze(createChannelRecordFromServer({ id: "0", type: ChannelType.GUILD_TEXT }));

    return function AttachmentPreview({ attachment }: AttachmentsComponentProps) {
        const message = useMemo(
            () => createPreviewMessage(attachment, channel.id),
            [attachment, channel.id]
        );

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

export function FilePicker({ onSelectItem }: FilePickerProps) {
    const listRef = useRef<ScrollerBaseRef>(null);

    const { channelId, query } = ExpressionPickerStore.useExpressionPickerStore(store => ({
        channelId: store.activeChannelId as string,
        query: store.searchQuery
    }));

    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(channelId), [channelId]);

    const favs = useFavourites(CustomItemFormat.ATTACHMENT, query);
    const count = useMemo(() => (favs ? Object.keys(favs).length : 0), [favs]);

    const [rowHeights, handleResize] = useListScroller();

    const handleSubmit = useCallback((url: string) => onSelectItem({ url }), []);

    const renderRow = (row: number) => {
        const item = favs?.[row];
        if (!item) return null;

        return (
            <FilePickerItem
                key={item.url}
                url={item.url}
                file={item.data}
                channel={channel}
                reducePadding={row !== count - 1}
                onResize={handleResize}
                onSubmit={handleSubmit}
            />
        );
    };

    useEffect(() => void listRef.current?.scrollToTop(), [query]);

    return (
        <div id="files-picker-tab-panel" role="tabpanel" aria-labelledby="files-picker-tab" className={cl("container")}>
            <div className={cl("container-header")}>
                <ManaSearchBar
                    autoFocus
                    placeholder="Search files"
                    query={query}
                    onChange={query => ExpressionPickerStore.setSearchQuery(query)}
                    onClear={() => ExpressionPickerStore.setSearchQuery("")}
                />
            </div>
            {count > 0 ? (
                <div className={cl("container-body")}>
                    <ListScroller
                        ref={listRef}
                        sections={[count]}
                        sectionHeight={0}
                        rowHeight={(_, row) => (favs?.[row] && rowHeights.get(favs[row].url)) ?? 100}
                        renderSection={() => null}
                        renderRow={({ row }) => renderRow(row)}
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

const IMAGE_GUTTER = 12;

function computeImageLayout(items: { width: number; height: number; }[], containerWidth: number) {
    // Discord's GIF tab uses absolute positioning for its grid rather than CSS columns
    // column count and item dimensions were reverse-engineered from the DOM. Items are placed into whichever
    // column has the smallest accumulated height matching Discord's "shortest-column-first" logic
    const cols = Math.max(2, Math.round(containerWidth / 230));
    const colWidth = (containerWidth - IMAGE_GUTTER * (cols + 1)) / cols;
    const colTops = Array<number>(cols).fill(IMAGE_GUTTER);
    return items.map(item => {
        const col = colTops.indexOf(Math.min(...colTops));
        const itemHeight = Math.round((item.height / item.width) * colWidth);
        const layout = {
            left: IMAGE_GUTTER + col * (colWidth + IMAGE_GUTTER),
            top: colTops[col],
            width: colWidth,
            height: itemHeight,
        };
        colTops[col] += itemHeight + IMAGE_GUTTER;
        return layout;
    });
}

export function ImagePicker({ onSelectItem }: FilePickerProps) {
    const { query } = ExpressionPickerStore.useExpressionPickerStore(store => ({
        query: store.searchQuery
    }));

    const favs = useImageFavourites(query);
    const count = useMemo(() => favs?.length ?? 0, [favs]);

    const handleSubmit = useCallback((url: string) => onSelectItem({ url }), []);

    const scrollerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(496);
    useResizeObserver(scrollerRef, ({ width }) => setContainerWidth(width), []);

    useEffect(() => { scrollerRef.current?.scrollTo(0, 0); }, [query]);

    const layout = useMemo(
        () => (favs ? computeImageLayout(favs, containerWidth) : []),
        [favs, containerWidth]
    );

    const IMAGE_END_CONTAINER_HEIGHT = 220;

    const itemsBottom = useMemo(
        () => layout.length === 0 ? IMAGE_GUTTER : Math.max(...layout.map(item => item.top + item.height)) + IMAGE_GUTTER,
        [layout]
    );

    const totalHeight = itemsBottom + IMAGE_END_CONTAINER_HEIGHT + IMAGE_GUTTER;

    const visibleIndices = useVirtualizedMasonry(scrollerRef, layout);

    return (
        <div id="image-picker-tab-panel" role="tabpanel" aria-labelledby="image-picker-tab" className={cl("container")}>
            <div className={cl("container-header")}>
                <ManaSearchBar
                    autoFocus
                    placeholder="Search images"
                    query={query}
                    onChange={query => ExpressionPickerStore.setSearchQuery(query)}
                    onClear={() => ExpressionPickerStore.setSearchQuery("")}
                />
            </div>
            {count > 0 ? (
                <div style={{ flex: "1", minHeight: "0", display: "flex" }}>
                    <div ref={scrollerRef} className={`${ScrollerClasses.thin} ${ScrollerClasses.scrollerBase} ${ScrollerClasses.fade} ${cl("image-results")}`}>
                        <div className={cl("image-content")} style={{ height: totalHeight }}>
                            <div className={cl("image-inner")}>
                                {visibleIndices.map(i => (
                                    <ImagePickerItem
                                        key={favs![i].url}
                                        url={favs![i].url}
                                        src={favs![i].src}
                                        width={favs![i].width}
                                        height={favs![i].height}
                                        layout={layout[i]}
                                        onSubmit={handleSubmit}
                                    />
                                ))}
                            </div>
                            <div style={{ position: "absolute", left: 0, width: "100%", top: itemsBottom, height: IMAGE_END_CONTAINER_HEIGHT + IMAGE_GUTTER }}>
                                <div className={GifPickerClasses.endContainer} style={{ position: "sticky", left: IMAGE_GUTTER, width: `calc(100% - ${IMAGE_GUTTER}px)`, top: 0, height: IMAGE_END_CONTAINER_HEIGHT }} />
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className={cl("container-body", "container-info")} inert>
                    <BaseText className={cl("info-text")}>No images match your search.</BaseText>
                </div>
            )}
        </div>
    );
}

export function VideoPicker({ onSelectItem }: FilePickerProps) {
    const { query } = ExpressionPickerStore.useExpressionPickerStore(store => ({
        query: store.searchQuery
    }));

    const favs = useVideoFavourites(query);
    const count = useMemo(() => favs?.length ?? 0, [favs]);

    const handleSubmit = useCallback((url: string) => onSelectItem({ url }), []);

    const scrollerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(496);
    useResizeObserver(scrollerRef, ({ width }) => setContainerWidth(width), []);

    useEffect(() => { scrollerRef.current?.scrollTo(0, 0); }, [query]);

    const layout = useMemo(
        () => (favs ? computeImageLayout(favs, containerWidth) : []),
        [favs, containerWidth]
    );

    const VIDEO_END_CONTAINER_HEIGHT = 220;

    const itemsBottom = useMemo(
        () => layout.length === 0 ? IMAGE_GUTTER : Math.max(...layout.map(item => item.top + item.height)) + IMAGE_GUTTER,
        [layout]
    );

    const totalHeight = itemsBottom + VIDEO_END_CONTAINER_HEIGHT + IMAGE_GUTTER;

    const visibleIndices = useVirtualizedMasonry(scrollerRef, layout);

    return (
        <div id="video-picker-tab-panel" role="tabpanel" aria-labelledby="video-picker-tab" className={cl("container")}>
            <div className={cl("container-header")}>
                <ManaSearchBar
                    autoFocus
                    placeholder="Search videos"
                    query={query}
                    onChange={query => ExpressionPickerStore.setSearchQuery(query)}
                    onClear={() => ExpressionPickerStore.setSearchQuery("")}
                />
            </div>
            {count > 0 ? (
                <div style={{ flex: "1", minHeight: "0", display: "flex" }}>
                    <div ref={scrollerRef} className={`${ScrollerClasses.thin} ${ScrollerClasses.scrollerBase} ${ScrollerClasses.fade} ${cl("image-results")}`}>
                        <div className={cl("image-content")} style={{ height: totalHeight }}>
                            <div className={cl("image-inner")}>
                                {visibleIndices.map(i => (
                                    <VideoPickerItem
                                        key={favs![i].url}
                                        url={favs![i].url}
                                        src={favs![i].src}
                                        width={favs![i].width}
                                        height={favs![i].height}
                                        layout={layout[i]}
                                        onSubmit={handleSubmit}
                                    />
                                ))}
                            </div>
                            <div style={{ position: "absolute", left: 0, width: "100%", top: itemsBottom, height: VIDEO_END_CONTAINER_HEIGHT + IMAGE_GUTTER }}>
                                <div className={GifPickerClasses.endContainer} style={{ position: "sticky", left: IMAGE_GUTTER, width: `calc(100% - ${IMAGE_GUTTER}px)`, top: 0, height: VIDEO_END_CONTAINER_HEIGHT }} />
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className={cl("container-body", "container-info")} inert>
                    <BaseText className={cl("info-text")}>No videos match your search.</BaseText>
                </div>
            )}
        </div>
    );
}

function EmptyList() {
    return <BaseText className={cl("info-text")}>No files match your search.</BaseText>;
}

const demoAttachment: FullMessageAttachment = {
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
            <div className={cl("attachment-container", "demo", "first")}>
                <AttachmentPreview attachment={demoAttachment} />
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

export function FilePickerItem({ url, file, channel, onResize, onSubmit, reducePadding }: FilePickerItemProps) {
    const [isFetching, setIsFetching] = useState(false);

    const ref = useRef<HTMLDivElement>(null);
    useResizeObserver(ref, ({ height }) => onResize(url, height), [onResize, url]);

    const attachment = useStateFromStores(
        [SignedUrlsStore],
        () => ({ ...file, url: SignedUrlsStore.get(file.url), proxy_url: SignedUrlsStore.get(file.proxy_url) }),
        [file],
        lodash.isEqual
    ) as FullMessageAttachment;

    const { canAttachFiles, canSendMessages } = useStateFromStores(
        [PermissionStore],
        () => ({
            canAttachFiles: hasPermission(PermissionsBits.ATTACH_FILES, channel),
            canSendMessages: hasPermission(PermissionsBits.SEND_MESSAGES, channel)
        }),
        [channel]
    );

    const handleClick = useMemo(() => {
        switch (true) {
            case canAttachFiles:
                return async () => {
                    setIsFetching(true);
                    await sendAttachment(attachment, channel!);
                    ExpressionPickerStore.closeExpressionPicker();
                    setIsFetching(false);
                };
            case canSendMessages:
                return () => onSubmit(url);
            default:
                return null;
        }
    }, [attachment, canAttachFiles, canSendMessages, channel, url]);

    return (
        <div ref={ref} className={cl("attachment-container", reducePadding && "reduced-padding")}>
            <AttachmentPreview attachment={attachment} />
            {handleClick && (
                <Button onClick={handleClick} variant="secondary" disabled={isFetching}>
                    <SendIcon size="refresh_sm" color="currentColor" />
                </Button>
            )}
        </div>
    );
}

export function ImagePickerItem({ url, src, width, height, layout, onSubmit }: { url: string; src: string; width: number; height: number; layout?: { left: number; top: number; width: number; height: number; }; onSubmit: (url: string) => void; }) {
    useEffect(() => {
        SignedUrlsStore.addSigned(url);
        SignedUrlsStore.addSigned(src);
    }, [url, src]);

    const resolvedSrc = useStateFromStores(
        [SignedUrlsStore],
        () => SignedUrlsStore.get(src) ?? SignedUrlsStore.get(url) ?? src,
        [src, url]
    );

    return (
        <div
            className={`${GifPickerClasses.result} ${cl("image-result")}`}
            role="button"
            tabIndex={-1}
            style={layout ? { position: "absolute", left: layout.left, top: layout.top, width: layout.width, height: layout.height } : undefined}
            onClick={() => onSubmit(url)}
        >
            <img src={resolvedSrc} alt="" className={cl("image-gif")} draggable={false} />
            <FavoriteButton
                className={`${Classes.gifFavoriteButton} ${cl("image-fav-button")}`}
                format={FavouriteItemFormat.IMAGE}
                url={url}
                src={resolvedSrc}
                width={width}
                height={height}
            />
        </div>
    );
}

export function VideoPickerItem({ url, src, width, height, layout, onSubmit }: { url: string; src: string; width: number; height: number; layout?: { left: number; top: number; width: number; height: number; }; onSubmit: (url: string) => void; }) {
    useEffect(() => {
        SignedUrlsStore.addSigned(url);
        SignedUrlsStore.addSigned(src);
    }, [url, src]);

    const resolvedSrc = useStateFromStores(
        [SignedUrlsStore],
        () => SignedUrlsStore.get(src) ?? SignedUrlsStore.get(url) ?? src,
        [src, url]
    );

    const cleanResolvedSrc = stripExternalVideoMarker(resolvedSrc);
    const isDirectVideo = [cleanResolvedSrc, url].some(isDirectVideoFile);

    return (
        <div
            className={`${GifPickerClasses.result} ${cl("image-result")}`}
            role="button"
            tabIndex={-1}
            style={layout ? { position: "absolute", left: layout.left, top: layout.top, width: layout.width, height: layout.height } : undefined}
            onClick={() => onSubmit(url)}
        >
            {isDirectVideo ? (
                <video src={cleanResolvedSrc} className={cl("image-gif")} draggable={false} autoPlay muted loop playsInline preload="metadata" />
            ) : (
                <img src={cleanResolvedSrc} alt="" className={cl("image-gif")} draggable={false} />
            )}
            <FavoriteButton
                className={`${Classes.gifFavoriteButton} ${cl("image-fav-button")}`}
                format={FavouriteItemFormat.VIDEO}
                url={url}
                src={cleanResolvedSrc}
                width={width}
                height={height}
            />
        </div>
    );
}

export function EmbedAccessory() {
    const embed = React.useContext(EmbedContext);
    const mosaicIndex = React.useContext(EmbedMosaicContext);

    const props: FavoriteButtonProps | null = useMemo(() => {
        if (!embed || embed.type === "gifv") return null;

        const { video, image, images, thumbnail } = embed;

        if (video) {
            // This field is missing on videos by third party providers (TikTok, YouTube ...)
            const isProxiedVideo = !!video.proxyURL;

            // External videos don't have a video.proxyURL property that could be used for the preview - use the static thumbnail instead
            const src = video.proxyURL ?? thumbnail?.proxyURL ?? video.url;

            // External videos' content.url usually doesn't point to a valid resource that could be embedded
            const url = !isProxiedVideo ? embed.url! : video.url;
            const shouldMarkExternal = !isDirectVideoFile(url);
            const previewSrc = shouldMarkExternal ? (thumbnail?.proxyURL ?? src) : src;

            return {
                ...video,
                format: FavouriteItemFormat.VIDEO,
                src: shouldMarkExternal ? markExternalVideoSrc(previewSrc) : previewSrc,
                url
            };
        }

        const img = (mosaicIndex != null && images?.[mosaicIndex]) || image;
        if (!img) return null;

        const src = img.proxyURL ?? img.url;

        // Do not render the custom embed accessory if the original image already has a gif accessory
        const isAnimated = ImageUtils.isAnimated({ ...img, original: img.url, src, animated: false });
        if (isAnimated) return null;

        return { ...img, format: FavouriteItemFormat.IMAGE, src: markStaticImageSrc(src) };
    }, [embed, mosaicIndex]);

    return (
        props && (
            <div className={cl("image-accessory")}>
                <FavoriteButton {...props} className={Classes.gifFavoriteButton} />
            </div>
        )
    );
}

const visualMediaFormats: Partial<Record<AttachmentItem["type"], FavouriteItemFormat>> = Object.freeze({
    IMAGE: FavouriteItemFormat.IMAGE,
    VIDEO: FavouriteItemFormat.VIDEO,
    CLIP: FavouriteItemFormat.VIDEO
});

export function AttachmentAccessory() {
    const attachment = React.useContext(AttachmentContext);

    const props: FavoriteButtonProps | null = useMemo(() => {
        if (!attachment?.downloadUrl) return null;
        const { originalItem, type, downloadUrl, width = 600, height = 400, srcIsAnimated } = attachment;

        // Do not render the custom accessory if the original attachment component already has a gif accessory
        const isAnimated = ImageUtils.isAnimated({
            original: originalItem.url,
            src: originalItem.proxy_url,
            animated: false,
            srcIsAnimated
        });
        if (isAnimated) return null;

        if (type in visualMediaFormats) {
            const format = visualMediaFormats[type]!;
            const src = format === FavouriteItemFormat.IMAGE
                ? markStaticImageSrc(originalItem.proxy_url)
                : originalItem.proxy_url;
            return { format, src, url: downloadUrl, width, height };
        }

        // Non visual attachments have to be encoded to store metadata in the src property.
        // Note that this isn't a valid url yet, the full url (with a fallback image for vanilla client compat)
        // is generated via `getThumbnailUrl` once the user clicks the favourite button
        const src = defs.encode(CustomItemFormat.ATTACHMENT, originalItem)?.toString();
        if (!src) return null;

        return { format: FavouriteItemFormat.NONE, src, url: downloadUrl, width, height };
    }, [attachment]);

    return props && <FavoriteButton {...props} className={cl("attachment-accessory")} />;
}
