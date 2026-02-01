
// Mock chrome extension APIs for local preview
if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    window.chrome = {
        runtime: {
            id: 'mock-id',
            sendMessage: (message, callback) => {
                console.log('Mock sendMessage:', message);

                if (message.action === "sendWebhook") {
                    fetch(message.url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(message.payload)
                    })
                        .then(async r => {
                            const text = await r.text();
                            let json = {};
                            try { json = JSON.parse(text); } catch (e) { }
                            if (callback) callback({ success: r.ok, data: json, error: r.ok ? null : "HTTP Error" });
                        })
                        .catch(e => {
                            if (callback) callback({ success: false, error: e.message });
                        });
                    return true;
                }

                if (message.action === "sendWebhookWithFile") {
                    (async () => {
                        try {
                            let body;
                            let headers = {};

                            if (message.file) {
                                const res = await fetch(message.file.data);
                                const blob = await res.blob();
                                const formData = new FormData();
                                formData.append('file', blob, message.file.name);
                                for (const key in message.payload) {
                                    formData.append(key, message.payload[key]);
                                }
                                body = formData;
                            } else {
                                headers["Content-Type"] = "application/json";
                                body = JSON.stringify(message.payload);
                            }

                            const r = await fetch(message.url, {
                                method: "POST",
                                headers: headers,
                                body: body
                            });

                            const text = await r.text();
                            let json = {};
                            try { json = JSON.parse(text); } catch (e) { }
                            if (callback) callback({ success: r.ok, data: json, error: r.ok ? null : "HTTP Error" });

                        } catch (e) {
                            if (callback) callback({ success: false, error: e.message });
                        }
                    })();
                    return true;
                }

                if (callback) setTimeout(() => callback({ success: true, status: 'connected' }), 500);
            },
            onMessage: {
                addListener: (callback) => {
                    console.log('Mock addListener');
                }
            }
        },
        storage: {
            local: {
                get: (keys, callback) => {
                    console.log('Mock storage.local.get:', keys);
                    const data = {};
                    if (Array.isArray(keys)) {
                        keys.forEach(key => data[key] = localStorage.getItem(key));
                    } else if (typeof keys === 'string') {
                        data[keys] = localStorage.getItem(keys);
                    } else {
                        Object.keys(keys).forEach(key => data[key] = localStorage.getItem(key) || keys[key]);
                    }
                    if (callback) callback(data);
                },
                set: (data, callback) => {
                    console.log('Mock storage.local.set:', data);
                    Object.keys(data).forEach(key => localStorage.setItem(key, data[key]));
                    if (callback) callback();
                }
            },
            sync: {
                get: (keys, callback) => {
                    console.log('Mock storage.sync.get:', keys);
                    const data = {};
                    if (Array.isArray(keys)) {
                        keys.forEach(key => data[key] = localStorage.getItem('sync_' + key));
                    } else {
                        // simplify
                        callback({});
                        return;
                    }
                    if (callback) callback(data);
                },
                set: (data, callback) => {
                    console.log('Mock storage.sync.set:', data);
                    Object.keys(data).forEach(key => localStorage.setItem('sync_' + key, data[key]));
                    if (callback) callback();
                }
            }
        },
        tabs: {
            query: (options, callback) => {
                console.log('Mock tabs.query:', options);
                if (callback) callback([{ id: 1, url: 'https://lovable.dev/test' }]);
            },
            sendMessage: (tabId, message, callback) => {
                console.log('Mock tabs.sendMessage:', tabId, message);
                if (callback) callback({ success: true });
            }
        },
        scripting: {
            executeScript: (options, callback) => {
                console.log('Mock scripting.executeScript:', options);
                if (callback) callback([{ result: true }]);
            }
        }
    };
}
