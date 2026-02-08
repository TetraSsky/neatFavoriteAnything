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
import { proxyLazyWebpack } from "@webpack";
import { React } from "@webpack/common";
import { ComponentType, ReactNode } from "react";

import { AttachmentAccessory, EmbedAccessory, EmbedComponent, FilePicker } from "./components";
import { AttachmentItem, ExpressionPickerTabProps, ExpressionPickerView } from "./types";

export const EmbedContext = proxyLazyWebpack(() => React.createContext<null | Embed>(null));
export const AttachmentContext = proxyLazyWebpack(() => React.createContext<null | AttachmentItem>(null));

export default definePlugin({
    name: "FavouriteAnything",
    description: "Favourite any image",
    authors: [Devs.nin0dev, { name: "Davri", id: 457579346282938368n }],
    patches: [
        {
            find: "#{intl::SUPPRESS_ALL_EMBEDS}",
            replacement: {
                match: "render()",
                replace: "$&{return $self.renderEmbed.call(this)}__render()"
            }
        },
        {
            find: '["VIDEO","CLIP","AUDIO"]',
            replacement: [
                {
                    match: /let \i=function\((\i)\)\{/,
                    replace: "$&const __props=$1;"
                },
                {
                    match: /children:(\i)=>(V\(\1\))\}\):(V\(\))/,
                    replace: "children:$1=>$self.renderAttachment($2,__props)}):$self.renderAttachment($3,__props)"
                },
                {
                    match: "=[];",
                    replace: "=[$self.renderAttachmentAccessory()];"
                }
            ]
        },
        {
            find: '"aria-label":B.intl.string(B.t.fSiQ3A)',
            replacement: {
                match: /renderAdjacentContent:(\i)/g,
                replace: "$&=$self.renderEmbedAccessory"
            }
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
    renderAttachment(children: ReactNode, props: { item: AttachmentItem }) {
        return <AttachmentContext.Provider value={props.item}>{children}</AttachmentContext.Provider>;
    },
    renderEmbed(this: EmbedComponent) {
        return <EmbedContext.Provider value={this.props.embed}>{this.__render()}</EmbedContext.Provider>;
    },
    renderAttachmentAccessory: () => <AttachmentAccessory />,
    renderEmbedAccessory: () => <EmbedAccessory />
});
