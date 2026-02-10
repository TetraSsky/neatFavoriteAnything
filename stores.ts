/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { proxyLazyWebpack } from "@webpack";
import { Constants, Flux, FluxDispatcher, RestAPI } from "@webpack/common";

import { RefreshedUrlsResponse } from "./types";
import { BatchedRequestQueue } from "./utils";

export const SignedUrlsStore = proxyLazyWebpack(() => {
    interface Store {
        get(url: string): string | null;
        add(url: string): void;
    }

    class SignedUrlsStore extends Flux.Store implements Store {
        private readonly _allowedHosts = new Set([
            window.GLOBAL_ENV.CDN_HOST,
            ...[window.GLOBAL_ENV.IMAGE_PROXY_ENDPOINTS, window.GLOBAL_ENV.MEDIA_PROXY_ENDPOINT]
                .flatMap(endpoint => endpoint.split(","))
                .map(endpoint => URL.parse(endpoint)?.host)
                .filter(Boolean)
        ]);

        private _urls = new Map<string, string>();
        private _queue = new BatchedRequestQueue<string>(batch => this._handleBatch(batch), {
            maxCount: 50,
            timeout: 50
        });

        __getLocalVars() {
            return { urls: this._urls, queue: this._queue };
        }

        public get(url: string): string | null {
            const value = this._urls.get(url);
            if (value) return value;

            const parsed = URL.parse(url);
            if (parsed && this._allowedHosts.has(parsed.host)) this._queue.add(url);

            return null;
        }

        public add(url: string) {
            const parsed = URL.parse(url);
            if (!parsed || !this._allowedHosts.has(parsed.host)) return;

            parsed.search = "";

            this._update([[`${parsed}`, url]]);
        }

        private _update(urls: [string, string][]) {
            let hasChanged: boolean = false;

            for (const [url, value] of urls) {
                if (!value || url === value || this._urls.get(url) === value) continue;

                this._urls.set(url, value);
                hasChanged = true;
            }

            if (hasChanged) this.emitChange();
        }

        private async _handleBatch(batch: string[]) {
            await RestAPI.post({
                url: Constants.Endpoints.ATTACHMENTS_REFRESH_URLS,
                body: { attachment_urls: batch },
                retries: 3
            }).then(({ body }: { body: RefreshedUrlsResponse }) =>
                this._update(body.refreshed_urls.map(({ original, refreshed }) => [original, refreshed!]))
            );
        }
    }

    return new SignedUrlsStore(FluxDispatcher) as Store;
});
