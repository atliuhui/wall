'use strict';

(function () {
    format.extend(String.prototype, {});
    const Liquid = window.liquidjs.Liquid;
    const engine = new Liquid({
        cache: true,
    });

    var events = $({});
    var messages = {};
    events.bind('disable', function (event) {
    });
    events.bind('publish', function (event, message) {
        messages[message.id] = message;
        events.trigger('refresh', messages);
    });

    function ParseUserAgent() {
        const ua = navigator.userAgent.trim();
        const result = {
            browser: { name: 'Unknown', version: '' },
            os: { name: 'Unknown', version: '' },
            device: { type: 'Unknown' } // phone/tablet/desktop/Unknown（粗略）
        };

        if (!ua) return result;

        // ---- 设备类型粗判 ----
        if (/Mobile|iPhone|Android(?!.*Tablet)/i.test(ua)) {
            result.device.type = 'phone';
        } else if (/iPad|Tablet|Android.*Tablet/i.test(ua)) {
            result.device.type = 'tablet';
        } else {
            result.device.type = 'desktop';
        }

        // ---- 操作系统解析 ----
        // Windows
        let m;
        if ((m = ua.match(/Windows NT\s*([\d.]+)/i))) {
            result.os.name = 'Windows';
            // 映射主要版本（可按需扩展）
            const nt = m[1];
            const map = {
                '10.0': '10/11', // UA 常见都写 10.0，无法区分 Win10/11
                '6.3': '8.1',
                '6.2': '8',
                '6.1': '7'
            };
            result.os.version = map[nt] ? map[nt] : nt;
        }
        // macOS
        else if ((m = ua.match(/Mac OS X\s*([\d_]+)/i))) {
            result.os.name = 'macOS';
            result.os.version = m[1].replace(/_/g, '.');
        }
        // iOS（含 iPhone/iPad/iPod）
        else if ((m = ua.match(/iPhone OS\s*([\d_]+)/i)) || (m = ua.match(/CPU OS\s*([\d_]+)/i)) || (m = ua.match(/CPU iPhone OS\s*([\d_]+)/i))) {
            result.os.name = 'iOS';
            result.os.version = m[1].replace(/_/g, '.');
        } else if (/iPad|iPod|iPhone/i.test(ua) && (m = ua.match(/Version\/([\d.]+)/i))) {
            // 某些旧 UA 形态
            result.os.name = 'iOS';
            result.os.version = m[1];
        }
        // Android
        else if ((m = ua.match(/Android\s*([\d.]+)/i))) {
            result.os.name = 'Android';
            result.os.version = m[1];
        }
        // ChromeOS（较少见但保留）
        else if ((m = ua.match(/CrOS\s+\S+\s+([\d.]+)/i))) {
            result.os.name = 'ChromeOS';
            result.os.version = m[1];
        }
        // Linux
        else if (/Linux/i.test(ua)) {
            result.os.name = 'Linux';
            result.os.version = ''; // UA 通常不含发行版/版本
        }

        // ---- 浏览器解析 ----
        // 优先处理 iOS 上的 Chromium/Edge（CriOS/EdgiOS）
        if ((m = ua.match(/CriOS\/([\d.]+)/i))) {
            //result.browser.name = 'Chrome (iOS)';
            result.browser.name = 'Chrome';
            result.browser.version = m[1];
        } else if ((m = ua.match(/EdgiOS\/([\d.]+)/i))) {
            //result.browser.name = 'Edge (iOS)';
            result.browser.name = 'Edge';
            result.browser.version = m[1];
        }
        // iOS Safari（Version/x.y + Safari）
        else if (/Safari/i.test(ua) && /Version\/([\d.]+)/i.test(ua) && /Mobile|iPhone|iPad|iPod/i.test(ua)) {
            //result.browser.name = 'Safari (iOS)';
            result.browser.name = 'Safari';
            result.browser.version = ua.match(/Version\/([\d.]+)/i)[1];
        }
        // Edge (Chromium) on desktop
        else if ((m = ua.match(/Edg\/([\d.]+)/))) {
            result.browser.name = 'Edge';
            result.browser.version = m[1];
        }
        // Opera (Chromium) 以 OPR/ 表示
        else if ((m = ua.match(/OPR\/([\d.]+)/))) {
            result.browser.name = 'Opera';
            result.browser.version = m[1];
        }
        // Chrome 桌面/Android（排除 Edge/Opera）
        else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua)) {
            m = ua.match(/Chrome\/([\d.]+)/i);
            result.browser.name = 'Chrome';
            result.browser.version = m ? m[1] : '';
        }
        // Firefox（含 Android）
        else if ((m = ua.match(/Firefox\/([\d.]+)/i))) {
            result.browser.name = 'Firefox';
            result.browser.version = m[1];
        }
        // 桌面 Safari（Version/x.y + Safari，且非 iOS）
        else if (/Safari/i.test(ua) && /Version\/([\d.]+)/i.test(ua)) {
            result.browser.name = 'Safari';
            result.browser.version = ua.match(/Version\/([\d.]+)/i)[1];
        }
        // 兜底（少数内核或特殊壳）
        else {
            // 尝试提取最后一个形如 Name/x.y.z 的片段
            const lastToken = ua.match(/([A-Za-z]+)\/([\d.]+)/g);
            if (lastToken && lastToken.length > 0) {
                const pair = lastToken[lastToken.length - 1].split('/');
                result.browser.name = pair[0];
                result.browser.version = pair[1] || '';
            }
        }

        return result;
    }
    function GetGroup() {
        return localStorage.getItem('group') ?? 'default';
    }
    function GetUser() {
        //return localStorage.getItem('user') ?? navigator.userAgentData.platform;
        return localStorage.getItem('user') ?? (() => {
            const agent = ParseUserAgent();
            return `${agent.browser.name}(${agent.os.name})`;
        })();
    }

    var connection = new signalR.HubConnectionBuilder().withUrl('/hub').build();
    function Start(callback) {
        connection.onclose(function (error) {
            events.trigger('disable');
        });
        connection.start().then(function () {
            if (callback) callback.call(this);
        }).catch(function (error) {
            return console.error(error.toString());
        });
    }
    function Ready(callback) {
        ReceiveMessage();
        Join(GetGroup(), function (error, result) {
            SyncMessage(GetGroup(), function (error, result) {
                if (callback) callback.call(this);
            });
        });
    }
    function Ensure(callback) {
        if (connection.state === signalR.HubConnectionState.Connected) {
            if (callback) callback.call(this);
        } else {
            Start(function (error) {
                if (!error) {
                    ReceiveMessage();
                    Join(GetGroup(), function (error, result) {
                        if (callback) callback.call(this);
                    });
                }
            });
        }
    }
    function Join(group, callback) {
        connection.invoke('Join', group).then(callback).catch(callback);
    }
    function SyncMessage(group, callback) {
        connection.invoke('SyncMessage', group).then(callback).catch(callback);
    }
    function SendMessage(user, group, title, content, callback) {
        connection.invoke('SendMessage', user, group, title, content).then(callback).catch(callback);
    }
    function ReceiveMessage() {
        connection.on('ReceiveMessage', function (user, group, id, created, title, base64content, formatcontent) {
            //console.log(arguments);
            events.trigger('publish', {
                user,
                group,
                id,
                created,
                title,
                base64content,
                formatcontent,
            });
        });
    }

    $(document).ready(function () {
        var $file_input = $('#file-input');
        const $pills_tab = $('#pills-tab button');
        const $text_input = $('#text-input');
        const $send = $('#send');
        const file_change = function () {
            const file = this.files[0];
            const reader = new FileReader();
            reader.onload = function (event) {
                const dataUrl = event.target.result;
                const base64 = dataUrl.split(',')[1];
                SendMessage(GetUser(), GetGroup(), file.name, base64, function (error) {
                    if (error) {
                        return console.error(error);
                    }
                });

                InitFileInput();
            }
            reader.readAsDataURL(file);
        };
        function InitFileInput() {
            $file_input[0].outerHTML = $file_input[0].outerHTML;
            $file_input = $('#file-input');
            $file_input.on('change', file_change);
        }
        $pills_tab.on('click', function (event) {
            var text = event.currentTarget.innerText.toLowerCase();
            switch (text) {
                case 'file':
                    $('#panel-text').hide();
                    $('#panel-file').show();
                    break;
                case 'text':
                case 'shell':
                case 'powershell':
                case 'mssql':
                default:
                    $('#panel-text').show();
                    $('#panel-file').hide();
                    break;
            }
        });
        $send.on('click', function () {
            Ensure(function (error) {
                if (!error) {
                    const text = $text_input.val();
                    if (text.length == 0) {
                        console.log('input is empty');
                        return;
                    }

                    var type = $('#pills-tab button.active').text().toLowerCase();
                    switch (type) {
                        case 'mssql':
                            break;
                        default:
                            SendMessage(GetUser(), GetGroup(), null, text, function (error) {
                                if (error) {
                                    return console.error(error);
                                }
                            });
                            break;
                    }

                    $text_input.val('');
                }
            });
        });

        const list_item_text_template = engine.parse($('#list-item-text').html());
        const list_item_file_template = engine.parse($('#list-item-file').html());
        const list_item_image_template = engine.parse($('#list-item-image').html());
        var list = new ej.lists.ListView({
            dataSource: Object.values(messages),
            template: function (item) {
                var title = item.title.toLowerCase();
                if (title.endsWith('.txt')) {
                    return engine.renderSync(list_item_text_template, item);
                } else if (title.endsWith('.png')
                    || title.endsWith('.jpg')
                    || title.endsWith('.jpeg')
                    || title.endsWith('.gif')
                    || title.endsWith('.webp')
                    || title.endsWith('.svg')
                    || title.endsWith('.heic')
                    || title.endsWith('.heif')
                    || title.endsWith('.bmp')) {
                    return engine.renderSync(list_item_image_template, item);
                } else {
                    return engine.renderSync(list_item_file_template, item);
                }
            },
        });
        list.appendTo('#list');
        events.bind('refresh', function (event, messages) {
            list.dataSource = Object.values(messages);
            list.dataBind();
        });

        Start(function (error) {
            if (!error) {
                Ready();
                InitFileInput();
            }
        });
    });
})();
