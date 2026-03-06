// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const { usePlatform, useToast } = require('stremio/common');
const { useServices } = require('stremio/services');
const Option = require('./Option');
const styles = require('./styles');

const torrentClientConfigCache = { fetched: false, enabled: false, clientType: '' };

const CONTENT_TYPE_FOLDER = { movie: 'movies', series: 'series' };

const OptionsMenu = ({ className, stream, playbackDevices, extraSubtitlesTracks, selectedExtraSubtitlesTrackId, contentType }) => {
    const { t } = useTranslation();
    const { core } = useServices();
    const platform = usePlatform();
    const toast = useToast();
    const [torrentClientEnabled, setTorrentClientEnabled] = React.useState(torrentClientConfigCache.enabled);
    const [torrentClientType, setTorrentClientType] = React.useState(torrentClientConfigCache.clientType);
    const [streamingUrl, downloadUrl] = React.useMemo(() => {
        return stream !== null ?
            stream.deepLinks &&
            stream.deepLinks.externalPlayer &&
            [stream.deepLinks.externalPlayer.streaming, stream.deepLinks.externalPlayer.download]
            :
            [null, null];
    }, [stream]);
    const externalDevices = React.useMemo(() => {
        return playbackDevices.filter(({ type }) => type === 'external');
    }, [playbackDevices]);

    const subtitlesTrackUrl = React.useMemo(() => {
        const track = extraSubtitlesTracks?.find(({ id }) => id === selectedExtraSubtitlesTrackId);
        return track?.fallbackUrl ?? track?.url ?? null;
    }, [extraSubtitlesTracks, selectedExtraSubtitlesTrackId]);

    const isTorrentStream = React.useMemo(() => {
        return stream !== null && typeof stream.infoHash === 'string' && stream.infoHash.length > 0;
    }, [stream]);

    React.useEffect(() => {
        if (torrentClientConfigCache.fetched) return;
        fetch('/api/torrent/config')
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                if (data && data.enabled) {
                    torrentClientConfigCache.fetched = true;
                    torrentClientConfigCache.enabled = true;
                    torrentClientConfigCache.clientType = data.clientType || '';
                    setTorrentClientEnabled(true);
                    setTorrentClientType(data.clientType || '');
                } else {
                    torrentClientConfigCache.fetched = true;
                }
            })
            .catch(() => {
                torrentClientConfigCache.fetched = true;
            });
    }, []);

    const buildMagnetUri = React.useCallback(() => {
        if (!stream || !stream.infoHash) return null;
        const params = [`xt=urn:btih:${stream.infoHash}`];
        const displayName = stream.description ? stream.description.split('\n')[0].trim() : stream.name;
        if (displayName) params.push(`dn=${encodeURIComponent(displayName)}`);
        if (Array.isArray(stream.sources)) {
            stream.sources.forEach((src) => {
                if (typeof src === 'string' && src.startsWith('tracker:')) {
                    params.push(`tr=${encodeURIComponent(src.replace('tracker:', ''))}`);
                }
            });
        }
        return `magnet:?${params.join('&')}`;
    }, [stream]);

    const subtitleBaseName = React.useMemo(() => {
        if (!stream) return null;
        const name = stream.title || stream.name || stream.infoHash || 'video';
        return name.replace(/[/\\?%*:|"<>]/g, '_');
    }, [stream]);

    const onQueueDownloadClick = React.useCallback(() => {
        const magnet = buildMagnetUri();
        if (!magnet) return;

        const body = { magnet };
        if (subtitlesTrackUrl) {
            body.subtitleUrl = subtitlesTrackUrl;
            body.subtitleName = subtitleBaseName;
        }
        const subfolder = CONTENT_TYPE_FOLDER[contentType];
        if (subfolder) body.downloadSubfolder = subfolder;

        fetch('/api/torrent/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.result === 'success' || data.arguments) {
                    const added = data.arguments?.['torrent-added'] || data.arguments?.['torrent-duplicate'];
                    const name = added?.name || stream.name || stream.infoHash;
                    let message = name;
                    if (data.subtitleFile) {
                        message += ` (+${data.subtitleFile})`;
                    }
                    toast.show({
                        type: 'success',
                        title: t('TORRENT_QUEUED', { defaultValue: 'Download queued' }),
                        message,
                        timeout: 4000,
                    });
                } else {
                    throw new Error(data.error || 'Unknown error');
                }
            })
            .catch((e) => {
                toast.show({
                    type: 'error',
                    title: t('ERROR'),
                    message: e.message,
                    timeout: 4000,
                });
            });
    }, [buildMagnetUri, subtitlesTrackUrl, subtitleBaseName, stream, contentType]);

    const onCopyStreamButtonClick = React.useCallback(() => {
        if (streamingUrl || downloadUrl) {
            navigator.clipboard.writeText(streamingUrl || downloadUrl)
                .then(() => {
                    toast.show({
                        type: 'success',
                        title: 'Copied',
                        message: t('PLAYER_COPY_STREAM_SUCCESS'),
                        timeout: 3000
                    });
                })
                .catch((e) => {
                    console.error(e);
                    toast.show({
                        type: 'error',
                        title: t('Error'),
                        message: `${t('PLAYER_COPY_STREAM_ERROR')}: ${streamingUrl || downloadUrl}`,
                        timeout: 3000
                    });
                });
        }
    }, [streamingUrl, downloadUrl]);
    const onDownloadVideoButtonClick = React.useCallback(() => {
        if (downloadUrl || streamingUrl ) {
            platform.openExternal(downloadUrl || streamingUrl);
        }
    }, [streamingUrl, downloadUrl]);

    const onDownloadSubtitlesClick = React.useCallback(() => {
        subtitlesTrackUrl && platform.openExternal(subtitlesTrackUrl);
    }, [subtitlesTrackUrl]);

    const onExternalDeviceRequested = React.useCallback((deviceId) => {
        if (streamingUrl) {
            core.transport.dispatch({
                action: 'StreamingServer',
                args: {
                    action: 'PlayOnDevice',
                    args: {
                        device: deviceId,
                        source: streamingUrl,
                    }
                }
            });
        }
    }, [streamingUrl]);
    const onMouseDown = React.useCallback((event) => {
        event.nativeEvent.optionsMenuClosePrevented = true;
    }, []);

    const queueLabel = React.useMemo(() => {
        const clientName = torrentClientType ?
            torrentClientType.charAt(0).toUpperCase() + torrentClientType.slice(1)
            : 'Torrent client';
        return t('TORRENT_QUEUE_DOWNLOAD', {
            defaultValue: `Queue in ${clientName}`,
            client: clientName,
        });
    }, [t, torrentClientType]);

    return (
        <div className={classnames(className, styles['options-menu-container'])} onMouseDown={onMouseDown}>
            {
                torrentClientEnabled && isTorrentStream ?
                    <Option
                        icon={'ic_downloads'}
                        label={queueLabel}
                        disabled={stream === null}
                        onClick={onQueueDownloadClick}
                    />
                    :
                    null
            }
            {
                streamingUrl || downloadUrl ?
                    <Option
                        icon={'link'}
                        label={t('CTX_COPY_STREAM_LINK')}
                        disabled={stream === null}
                        onClick={onCopyStreamButtonClick}
                    />
                    :
                    null
            }
            {
                streamingUrl || downloadUrl ?
                    <Option
                        icon={'download'}
                        label={t('CTX_DOWNLOAD_VIDEO')}
                        disabled={stream === null}
                        onClick={onDownloadVideoButtonClick}
                    />
                    :
                    null
            }
            {
                subtitlesTrackUrl ?
                    <Option
                        icon={'download'}
                        label={t('CTX_DOWNLOAD_SUBS')}
                        disabled={stream === null}
                        onClick={onDownloadSubtitlesClick}
                    />
                    :
                    null
            }
            {
                streamingUrl && externalDevices.map(({ id, name }) => (
                    <Option
                        key={id}
                        icon={'vlc'}
                        label={t('PLAYER_PLAY_IN', { device: name })}
                        deviceId={id}
                        disabled={stream === null}
                        onClick={onExternalDeviceRequested}
                    />
                ))
            }
        </div>
    );
};

OptionsMenu.propTypes = {
    className: PropTypes.string,
    stream: PropTypes.object,
    playbackDevices: PropTypes.array,
    extraSubtitlesTracks: PropTypes.array,
    selectedExtraSubtitlesTrackId: PropTypes.string,
    contentType: PropTypes.string,
};

module.exports = OptionsMenu;
