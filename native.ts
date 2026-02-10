/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MessageAttachment } from "@vencord/discord-types";

export async function fetchAttachment(_: unknown, { url, content_type, filename }: MessageAttachment) {
    const res = await fetch(url, { headers: { Accept: "*/*" } });
    if (!res.ok) throw new Error("Server error");

    const blob = await res.blob();
    const type = blob.type || content_type || "application/octet-stream";
    const data = await blob.arrayBuffer();

    return { type, data, filename };
}
