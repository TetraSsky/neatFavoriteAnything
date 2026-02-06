/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 nin0
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { Devs } from "@utils/constants";
import { getIntlMessage } from "@utils/discord";
import definePlugin from "@utils/types";
import { Embed } from "@vencord/discord-types";
import { findCssClassesLazy, proxyLazyWebpack } from "@webpack";
import { React, useMemo } from "@webpack/common";
import { Component, ComponentType, ReactNode } from "react";

import { FavoriteButton, FavoriteButtonProps, FilePicker } from "./components";
import { AttachmentItem, ExpressionPickerTabProps, ExpressionPickerView, FavouriteItemFormat } from "./types";
import { encodeAttachment } from "./utils";

interface AccessoryProps extends Pick<FavoriteButtonProps, "width" | "height" | "url"> {
    proxyUrl?: string;
    video?: boolean;
}

const Classes = findCssClassesLazy("gifFavoriteButton", "ctaButtonContainer");

interface EmbedComponent extends Component<{ embed: Embed }> {
    __render: () => ReactNode;
}

const EmbedContext = proxyLazyWebpack(() => React.createContext<null | Embed>(null));

const AttachmentContext = proxyLazyWebpack(() => React.createContext<null | AttachmentItem>(null));

// const forbiddenTypes: Set<AttachmentItem["type"]> = new Set(["IMAGE", "VIDEO", "VISUAL_PLACEHOLDER", "INVALID"]);

export default definePlugin({
    name: "FavouriteAnything",
    description: "Favourite any image",
    authors: [Devs.nin0dev, { name: "Davri", id: 457579346282938368n }],
    patches: [
        // TODO: Remove old patches, instead of gifAccessory use generic attachment component accessories
        {
            find: "static isAnimated",
            replacement: [
                // .isAnimated is checked in almost every media overlay event listener, so it's easier to patch the source.
                {
                    match: /static isAnimated\((\i)\)\{/,
                    replace: "static isAnimated($1,override){if(!override)return true;"
                },
                // Always render the custom accessory if the prop wasn't provided. This mostly affects video attachments.
                // Url and proxyUrl are additionally set to the same value, since the original url property only stores the thumbnail.
                {
                    match: /(?<=this\.props\.renderAccessory\(\):)null/,
                    replace: "$self.Accessory({...this.props,url:this.props.proxyUrl,video:true})"
                },
                // Always return static thumbnails for non gif media to prevent graphical glitches (side effect of the first patch).
                {
                    match: /getSrc\(\i\)\{let \i=/,
                    replace: "$&!this.constructor.isAnimated(this.props,true)||"
                },
                // Hide the default "GIF" tag accessory that is visible when discord is unfocused.
                {
                    match: "return this.props.shouldRenderAccessory?",
                    replace: "$&!this.constructor.isAnimated(this.props,true)||"
                }
            ]
        },
        // Wrap the embed component with a custom context provider to avoid having to drill props.
        {
            find: "#{intl::SUPPRESS_ALL_EMBEDS}",
            replacement: {
                match: "render()",
                replace: "$&{return $self.renderEmbed.call(this)}__render()"
            }
        },
        // Replace the default gif accessory with a custom one that skips fileType checks. Mostly affects image attachments.
        {
            find: "renderComponentAccessories",
            replacement: {
                match: /\i=>\(\)=>\{.{200,300}?null\}/,
                replace: "props=>()=>$self.Accessory({...props,video:false})"
            }
        },
        // Add a proxyUrl prop alongside the src prop, which is used for video thumbnails.
        {
            find: "#{intl::VIDEO}),...",
            replacement: {
                match: /src:\i(?=,\.\.\.)/,
                replace: "$&,proxyUrl:this.props.src"
            }
        },
        {
            find: '["VIDEO","CLIP","AUDIO"]',
            replacement: [
                {
                    match: /function \i\((\i)\)\{let/,
                    replace: "$& __props=$1,"
                },
                {
                    match: /renderAdjacentContent:(\i)/g,
                    replace: "renderAdjacentContent:$self.renderAdjacent($1,__props)"
                },
                {
                    match: "=[];",
                    replace: "=[$self.AdjacentAccessory()];"
                }
            ]
        },
        {
            find: "#{intl::EXPRESSION_PICKER_CATEGORIES_A11Y_LABEL}",
            replacement: [
                {
                    match: /\(0,\i\.jsx\)\((\i),.{20,40}"aria-selected":(\i).{50,100}#{intl::EXPRESSION_PICKER_GIF}\)\}\)/,
                    replace: "$self.renderTabs($1,$2)"
                },
                {
                    match: /(?<=null,)(\i)===\i\.\i\.EMOJI/,
                    replace: "$self.renderFilePicker($1),$&"
                }
            ]
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
    renderFilePicker(activeView: ExpressionPickerView) {
        return activeView === ExpressionPickerView.FILES ? <FilePicker /> : null;
    },
    renderAdjacent(render: () => ReactNode, props: { item: AttachmentItem }) {
        return () => <AttachmentContext.Provider value={props.item}>{render()}</AttachmentContext.Provider>;
    },
    renderEmbed(this: EmbedComponent) {
        return <EmbedContext.Provider value={this.props.embed}>{this.__render()}</EmbedContext.Provider>;
    },
    // TODO: move all components to components.tsx
    AdjacentAccessory() {
        const attachment = React.useContext(AttachmentContext);
        if (!attachment) return null;

        return <this.AdjacentAccessoryComponent {...attachment} />;
    },
    AdjacentAccessoryComponent({ originalItem, downloadUrl }: AttachmentItem) {
        const thumbnail = useMemo(() => encodeAttachment(originalItem)?.toString(), [originalItem]);
        if (!downloadUrl) return null;

        return (
            <FavoriteButton
                // TODO: Change format depending on the type prop
                format={FavouriteItemFormat.NONE}
                url={downloadUrl}
                src={thumbnail ?? downloadUrl}
                width={600}
                height={400}
            />
        );
    },
    Accessory(props: AccessoryProps) {
        const embed = React.useContext(EmbedContext);
        const content = embed?.image ?? embed?.video;

        const { url, proxyUrl, width, height, video } =
            embed && content
                ? {
                      ...content,
                      url: (embed.type === "gifv" && embed.url) || content.url,
                      proxyUrl: content.proxyURL,
                      video: !!embed.video
                  }
                : props;

        if (!width || !height || !url) return null;

        return (
            <FavoriteButton
                format={video ? FavouriteItemFormat.VIDEO : FavouriteItemFormat.IMAGE}
                className={Classes?.gifFavoriteButton}
                src={proxyUrl ?? url}
                url={url}
                width={width}
                height={height}
            />
        );
    }
});
