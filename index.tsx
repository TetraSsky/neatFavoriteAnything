/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 nin0
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarProps } from "@api/ChatButtons";
import { FolderIcon, ImageIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { getIntlMessage } from "@utils/discord";
import definePlugin from "@utils/types";
import { findCssClassesLazy, proxyLazyWebpack } from "@webpack";
import { ExpressionPickerStore, React } from "@webpack/common";
import { ComponentType, ReactNode } from "react";

import { AttachmentAccessory, EmbedAccessory, FilePicker, ImagePicker, VideoPicker } from "./components";
import { SignedUrlsStore } from "./stores";
import managedStyle from "./style.css?managed";
import { AttachmentItem, EmbedComponent, ExpressionPickerTabProps, ExpressionPickerView, FavouriteItem, FavouriteItemFormat, FullEmbed } from "./types";
import { getThumbnailUrl, isMediaItem } from "./utils";

export const EmbedContext = proxyLazyWebpack(() => React.createContext<null | FullEmbed>(null));
export const EmbedMosaicContext = proxyLazyWebpack(() => React.createContext<null | number>(null));
export const AttachmentContext = proxyLazyWebpack(() => React.createContext<null | AttachmentItem>(null));

const ButtonWrapperClasses = findCssClassesLazy("button", "buttonWrapper", "notificationDot");
const ChannelTextAreaClasses = findCssClassesLazy("buttonContainer", "channelTextArea", "button");

function PickerButton({ onClick, children }: { onClick: () => void; children: ReactNode; }) {
    return (
        <div className={`expression-picker-chat-input-button ${ChannelTextAreaClasses?.buttonContainer ?? ""}`}>
            <div
                role="button"
                tabIndex={0}
                className={`${ButtonWrapperClasses?.button ?? ""} ${ChannelTextAreaClasses?.button ?? ""}`}
                onClick={onClick}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClick(); }}
            >
                <div className={ButtonWrapperClasses?.buttonWrapper ?? ""}>
                    {children}
                </div>
            </div>
        </div>
    );
}

function VideoIcon({ height = 20, width = 20, className }: { height?: number; width?: number; className?: string; }) {
    return (
        <svg width={width} height={height} className={className} viewBox="0 0 24 24">
            <path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z" />
        </svg>
    );
}

export default definePlugin({
    name: "FavouriteAnything",
    description: "Favourite any image, video, or file attachment",
    authors: [Devs.nin0dev, { name: "Davri", id: 457579346282938368n }],
    managedStyle,
    capturedGifSelect: null as null | ((item: { url: string; }) => void),
    patches: [
        // CHATBAR BUTTONS
        {
            find: '"sticker")',
            replacement: {
                // Hook into "_injectButtons" (already patched by ChatInputButtonAPI)
                // ChatInputButtonAPI emits: _injectButtons(array, arguments[0])
                // Splice BEFORE the unshift so we work on Discord's original array
                match: /Vencord\.Api\.ChatButtons\._injectButtons\((\i),arguments\[0\]\)/,
                replace: "($self.injectMediaButtons($1,arguments[0]),Vencord.Api.ChatButtons._injectButtons($1,arguments[0]))"
            }
        },
        // EMBEDS
        {
            find: "this.renderInlineMediaEmbed",
            replacement: [
                {
                    // Wrap the embed component's render method in a custom context to avoid having to drill props
                    match: "render()",
                    replace: "$&{return $self.renderEmbed.call(this)}__render()"
                },
                {
                    // Specify the index for individual items in embed.images
                    match: /\.images\.map\((\i)=>(this.renderImage\(\{[^}]{50,100}\}\))\)/,
                    replace: ".images.map(($1,index)=>$self.renderEmbedMosaicItem($2,index))"
                }
            ]
        },
        {
            // Override the default renderAdjacentContent prop value for all types of embed components (renderImageComponent, renderVideoComponent...)
            find: "#{intl::MEDIA_MOSAIC_ALT_TEXT_POPOUT_TITLE}",
            replacement: {
                match: /renderAdjacentContent:(\i)/g,
                replace: "$&=$self.renderEmbedAccessory"
            }
        },
        // ATTACHMENTS
        {
            find: '["VIDEO","CLIP","AUDIO"]',
            replacement: [
                {
                    // Wrap the attachment component in a custom context to avoid having to drill props
                    match: /(?<=children:)(\i)=>(\i\(\1\))\}\):(\i\(\))/,
                    replace: "$1=>$self.renderAttachment($2,arguments[0])}):$self.renderAttachment($3,arguments[0])"
                },
                {
                    // Always add our custom accessory to the attachment's adjacent content
                    match: "=[];",
                    replace: "=[$self.renderAttachmentAccessory()];"
                }
            ]
        },
        // EXPRESSION PICKER
        {
            find: "#{intl::EXPRESSION_PICKER_CATEGORIES_A11Y_LABEL}",
            replacement: [
                {
                    // Replace the "GIFs" tab with two custom tabs
                    match: /\(0,\i\.jsx\)\((\i),[^}]{20,40}?"aria-selected":(\i)[^}]{50,100}?#{intl::EXPRESSION_PICKER_GIF}\)\}\)/,
                    replace: "$self.renderTabs($1,$2)"
                },
                {
                    // Insert the custom file picker into the expression picker's body
                    match: /\{onSelectGIF:(\i),[^}]{20,40}\}\):null,(?=(\i)===)/,
                    replace: "$&$self.renderFilePicker($2,$1),"
                }
            ]
        },
        {
            // Capture inner picker's "handleSelectGIF" callback so image can go through
            // the same interception path used by native GIF selection (GifPaste patch)
            find: "handleSelectGIF=",
            replacement: {
                match: /onSelectGIF:this\.handleSelectGIF/,
                replace: "onSelectGIF:$self.captureHandleSelectGIF(this.handleSelectGIF)"
            }
        },
        {
            // Hide favourite files from the GIFs/Media tab
            find: '.sortBy("order").reverse().value()',
            replacement: {
                match: '.sortBy("order").reverse()',
                replace: "$&.filter($self.filterGifs)"
            }
        },
        // FAVOURITE BUTTON
        {
            find: "#{intl::GIF_TOOLTIP_REMOVE_FROM_FAVORITES}",
            replacement: {
                // Intercept the onClick callback to replace the placeholder thumbnail with a valid CDN link
                match: /\(0,(\i\.\i)\)\((\{[^}].{40,60}?\})\)/,
                replace: "$self.interceptAddToFavourites($2).then($1)"
            }
        }
    ],
    renderTabs(Tab: ComponentType<ExpressionPickerTabProps>, activeView: ExpressionPickerView) {
        return (
            <>
                <Tab
                    id="gif-picker-tab"
                    key="gif-picker-tab"
                    aria-controls="gif-picker-tab-panel"
                    aria-selected={activeView === ExpressionPickerView.GIF}
                    isActive={activeView === ExpressionPickerView.GIF}
                    viewType={ExpressionPickerView.GIF}
                >
                    Media
                </Tab>
                <Tab
                    id="image-picker-tab"
                    key="image-picker-tab"
                    aria-controls="image-picker-tab-panel"
                    aria-selected={activeView === ExpressionPickerView.IMAGE}
                    isActive={activeView === ExpressionPickerView.IMAGE}
                    viewType={ExpressionPickerView.IMAGE}
                >
                    Image
                </Tab>
                <Tab
                    id="video-picker-tab"
                    key="video-picker-tab"
                    aria-controls="video-picker-tab-panel"
                    aria-selected={activeView === ExpressionPickerView.VIDEO}
                    isActive={activeView === ExpressionPickerView.VIDEO}
                    viewType={ExpressionPickerView.VIDEO}
                >
                    Video
                </Tab>
                <Tab
                    id="files-picker-tab"
                    key="files-picker-tab"
                    aria-controls="files-picker-tab-panel"
                    aria-selected={activeView === ExpressionPickerView.FILES}
                    isActive={activeView === ExpressionPickerView.FILES}
                    viewType={ExpressionPickerView.FILES}
                >
                    {getIntlMessage("FILES")}
                </Tab>
            </>
        );
    },
    renderFilePicker(activeView: ExpressionPickerView, onSelectGIF: (item: { url: string; }) => void) {
        if (activeView === ExpressionPickerView.IMAGE) {
            return <ImagePicker onSelectItem={item => this.handleSelectImage(item, onSelectGIF)} />;
        }

        if (activeView === ExpressionPickerView.VIDEO) {
            return <VideoPicker onSelectItem={item => this.handleSelectImage(item, onSelectGIF)} />;
        }

        if (activeView === ExpressionPickerView.FILES) {
            return <FilePicker onSelectItem={onSelectGIF} />;
        }

        return null;
    },
    captureHandleSelectGIF(handler: (item: { url: string; }) => void) {
        this.capturedGifSelect = handler;
        return handler;
    },
    handleSelectImage(item: { url: string; }, onSelectGIF: (item: { url: string; }) => void) {
        const handle = this.capturedGifSelect;
        // Fallback to the GIF handler if not captured
        if (handle) {
            handle(item);
        } else {
            onSelectGIF(item);
        }
    },
    renderAttachment(children: ReactNode, props: { item: AttachmentItem; }) {
        return <AttachmentContext.Provider value={props.item}>{children}</AttachmentContext.Provider>;
    },
    renderEmbed(this: EmbedComponent) {
        return <EmbedContext.Provider value={this.props.embed}>{this.__render()}</EmbedContext.Provider>;
    },
    renderEmbedMosaicItem(children: ReactNode, index: number) {
        return <EmbedMosaicContext.Provider value={index}>{children}</EmbedMosaicContext.Provider>;
    },
    renderAttachmentAccessory: () => <AttachmentAccessory />,
    renderEmbedAccessory: () => <EmbedAccessory />,
    filterGifs: (item: FavouriteItem & { url?: string; }) => {
        return isMediaItem(item);
    },
    interceptAddToFavourites: async (item: FavouriteItem & { url: string; }) => {
        if (item.format !== FavouriteItemFormat.NONE) return item;

        SignedUrlsStore.addSigned(item.url);

        if (URL.canParse(item.src)) {
            SignedUrlsStore.addSigned(item.src);
            return item;
        }

        const thumbnail = await getThumbnailUrl(item.src, item.width, item.height);
        if (!thumbnail) return item;

        thumbnail.search = "";
        thumbnail.hash = item.src;
        return { ...item, src: `${thumbnail}` };
    },
    openCustomExpressionPicker(view: ExpressionPickerView, activeViewType: any, channelId: string) {
        ExpressionPickerStore.setSearchQuery("");
        (ExpressionPickerStore as any).openExpressionPicker(view, activeViewType, channelId);
    },
    injectMediaButtons(buttons: ReactNode[], props: ChatBarProps) {
        // Called BEFORE "_injectButtons", "buttons" is Discord's original array
        // Find the sticker or gif button to know the right splice index
        if (props?.disabled || props?.type?.analyticsName !== "normal" || !(props as any).showAllButtons) return;

        let insertIdx = buttons.length; // fallback: append at end
        let gifIdx = -1;
        let stickerIdx = -1;

        for (let i = 0; i < buttons.length; i++) {
            const el = buttons[i] as any;
            if (!el) continue;

            const isSticker =
                el.key === "sticker" ||
                el.props?.viewType === "sticker" ||
                el.props?.type === "sticker";

            const isGif =
                el.key === "gif" ||
                el.props?.viewType === "gif" ||
                el.props?.type === "gif";

            if (isSticker) {
                stickerIdx = i;
            }

            if (isGif) {
                gifIdx = i;
            }
        }

        if (gifIdx !== -1) {
            insertIdx = gifIdx + 1;
        } else if (stickerIdx !== -1) {
            insertIdx = stickerIdx;
        }

        const channelId = props?.channel?.id ?? "";

        buttons.splice(insertIdx, 0,
            <PickerButton key="fav-image-btn" onClick={() => this.openCustomExpressionPicker(ExpressionPickerView.IMAGE, props?.type, channelId)}>
                <ImageIcon width={20} height={20} />
            </PickerButton>,
            <PickerButton key="fav-video-btn" onClick={() => this.openCustomExpressionPicker(ExpressionPickerView.VIDEO, props?.type, channelId)}>
                <VideoIcon width={20} height={20} />
            </PickerButton>,
            <PickerButton key="fav-files-btn" onClick={() => this.openCustomExpressionPicker(ExpressionPickerView.FILES, props?.type, channelId)}>
                <FolderIcon width={20} height={20} />
            </PickerButton>
        );
    }
});
