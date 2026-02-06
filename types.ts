/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FluxEvents, MessageAttachment } from "@vencord/discord-types";
import { PropsWithChildren } from "react";

export enum Format {
    NONE = 0,
    IMAGE = 1,
    VIDEO = 2
}

export enum ExpressionPickerView {
    EMOJI = "emoji",
    GIF = "gif",
    STICKER = "sticker",
    SOUNDBOARD = "soundboard",
    FILES = "files"
}

export interface ExpressionPickerTabProps extends PropsWithChildren {
    id?: string;
    "aria-controls"?: string;
    "aria-selected"?: boolean;
    isActive?: boolean;
    viewType: ExpressionPickerView;
}

export interface AttachmentItem {
    contentType: string;
    type: "IMAGE" | "VIDEO" | "CLIP" | "AUDIO" | "VISUAL_PLACEHOLDER" | "PLAINTEXT_PREVIEW" | "OTHER" | "INVALID";
    width?: number;
    height?: number;
    downloadUrl: string;
    spoiler: boolean;
    srcIsAnimated: boolean;
    uniqueId: string;
    originalItem: MessageAttachment;
}

export enum FavouriteItemFormat {
    NONE = 0,
    IMAGE = 1,
    VIDEO = 2
}

export interface FavouriteItem {
    format: FavouriteItemFormat;
    src: string;
    width: number;
    height: number;
    order: number;
}

export interface RefreshedUrlsResponse {
    refreshed_urls: [
        {
            original: string;
            refreshed: string | null;
        }
    ];
}

export type EncodedItem = [id: string, filename: string, size: number, path: string, contentType: string];

export type FluxEventHandlers<T extends Partial<Record<FluxEvents, unknown>>> = {
    [K in keyof T]?: (data: T[K]) => void;
} & {
    [K in FluxEvents]?: (data: T[K]) => void;
};
