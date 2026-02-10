/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { proxyLazyWebpack } from "@webpack";
import { Constants, Flux, FluxDispatcher, RestAPI } from "@webpack/common";

import { RefreshedUrlsResponse } from "./types";
import { BatchedRequestQueue } from "./utils";

export const AttachmentUrlsStore = proxyLazyWebpack(() => {
    interface Store {
        get(url: string): string | null;
    }

    class AttachmentUrlsStore extends Flux.Store implements Store {
        private _urls = new Map<string, string>();
        private _queue = new BatchedRequestQueue<string>(batch => this._handleBatch(batch), {
            maxCount: 50,
            timeout: 50
        });

        __getLocalVars() {
            return { urls: this._urls, queue: this._queue };
        }

        public get(url: string): string | null {
            return this._urls.get(url) ?? this._queue.add(url) ?? null;
        }

        private async _handleBatch(batch: string[]) {
            await RestAPI.post({
                url: Constants.Endpoints.ATTACHMENTS_REFRESH_URLS,
                body: { attachment_urls: batch },
                retries: 3
            }).then(({ body }: { body: RefreshedUrlsResponse }) => {
                let hasChanged: boolean = false;

                for (const { original, refreshed } of body.refreshed_urls) {
                    if (!refreshed || this._urls.get(original) === refreshed) continue;

                    this._urls.set(original, refreshed);
                    hasChanged = true;
                }

                if (hasChanged) this.emitChange();
            });
        }
    }

    // TODO: Add event listeners for common MESSAGE events, extract existing urls

    return new AttachmentUrlsStore(FluxDispatcher) as Store;
});
