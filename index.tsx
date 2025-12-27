/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 nin0
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy, findComponentByCodeLazy } from "@webpack";

enum Format {
    NONE = 0,
    IMAGE = 1,
    VIDEO = 2
}

interface FavoriteButtonProps {
    width: number;
    height: number;
    src: string;
    url: string;
    format: Format;
    className?: string;
}

interface AccessoryProps
    extends Pick<FavoriteButtonProps, "width" | "height" | "src"> {
    proxyUrl?: string;
    video?: boolean;
}

const FavoriteButton = findComponentByCodeLazy<FavoriteButtonProps>(
    "#{intl::GIF_TOOLTIP_ADD_TO_FAVORITES}"
);

const Classes = findByPropsLazy("gifFavoriteButton", "ctaButtonContainer");

export default definePlugin({
    name: "FavouriteAnything",
    description: "Favourite any image",
    authors: [Devs.nin0dev],
    patches: [
        {
            find: "static isAnimated",
            replacement: [
                {
                    match: /static isAnimated\(\i\)\{/,
                    replace: "$&return true;"
                },
                {
                    match: /this\.props\.renderAccessory\(\):null/,
                    replace:
                        "this.props.renderAccessory():$self.Accessory({...this.props,video:true})"
                }
            ]
        },
        {
            find: "renderComponentAccessories",
            replacement: {
                match: /\i=>\(\)=>\{.{200,300}?null\}/,
                replace:
                    "props=>()=>$self.Accessory({src:props.url,...props,video:false})"
            }
        },
        {
            find: '"renderOverlayContent","renderLinkComponent"',
            replacement: {
                match: /src:\i(?=\})/,
                replace: "$&,proxyUrl:this.props.src"
            }
        }
    ],
    Accessory({ src, proxyUrl, width, height, video }: AccessoryProps) {
        return (
            <FavoriteButton
                format={video ? Format.VIDEO : Format.IMAGE}
                className={Classes?.gifFavoriteButton}
                src={proxyUrl ?? src}
                url={src}
                width={width}
                height={height}
            />
        );
    }
});
