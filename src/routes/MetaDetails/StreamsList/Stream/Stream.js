// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { t } = require('i18next');
const { useProfile, usePlatform, useToast, useBinaryState } = require('stremio/common');
const { Button, Image, Popup } = require('stremio/components');
const { useServices } = require('stremio/services');
const { useRouteFocused } = require('stremio-router');
const StreamPlaceholder = require('./StreamPlaceholder');
const styles = require('./styles');

const torrentClientConfigCache = { fetched: false, enabled: false, clientType: '' };

const CONTENT_TYPE_FOLDER = { movie: 'movies', series: 'series' };

const Stream = ({ className, videoId, videoReleased, addonName, name, description, thumbnail, progress, deepLinks, infoHash, sources, contentType, ...props }) => {
    const profile = useProfile();
    const toast = useToast();
    const platform = usePlatform();
    const { core } = useServices();
    const routeFocused = useRouteFocused();

    const [menuOpen, , closeMenu, toggleMenu] = useBinaryState(false);
    const [torrentClientEnabled, setTorrentClientEnabled] = React.useState(torrentClientConfigCache.enabled);
    const [torrentClientType, setTorrentClientType] = React.useState(torrentClientConfigCache.clientType);

    const isTorrentStream = typeof infoHash === 'string' && infoHash.length > 0;

    React.useEffect(() => {
        if (torrentClientConfigCache.fetched) return;
        fetch('/api/torrent/config')
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                torrentClientConfigCache.fetched = true;
                if (data && data.enabled) {
                    torrentClientConfigCache.enabled = true;
                    torrentClientConfigCache.clientType = data.clientType || '';
                    setTorrentClientEnabled(true);
                    setTorrentClientType(data.clientType || '');
                }
            })
            .catch(() => { torrentClientConfigCache.fetched = true; });
    }, []);

    const popupLabelOnMouseUp = React.useCallback((event) => {
        if (!event.nativeEvent.togglePopupPrevented) {
            if (event.nativeEvent.ctrlKey || event.nativeEvent.button === 2) {
                event.preventDefault();
                toggleMenu();
            }
        }
    }, []);
    const popupLabelOnContextMenu = React.useCallback((event) => {
        if (!event.nativeEvent.togglePopupPrevented && !event.nativeEvent.ctrlKey) {
            event.preventDefault();
        }
    }, [toggleMenu]);
    const popupLabelOnLongPress = React.useCallback((event) => {
        if (event.nativeEvent.pointerType !== 'mouse' && !event.nativeEvent.togglePopupPrevented) {
            toggleMenu();
        }
    }, [toggleMenu]);
    const popupMenuOnPointerDown = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
    }, []);
    const popupMenuOnContextMenu = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
    }, []);
    const popupMenuOnClick = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
    }, []);
    const popupMenuOnKeyDown = React.useCallback((event) => {
        event.nativeEvent.buttonClickPrevented = true;
    }, []);

    const href = React.useMemo(() => {
        return deepLinks ?
            deepLinks.externalPlayer ?
                deepLinks.externalPlayer.web ?
                    deepLinks.externalPlayer.web
                    :
                    deepLinks.externalPlayer.openPlayer ?
                        deepLinks.externalPlayer.openPlayer[platform.name] ?
                            deepLinks.externalPlayer.openPlayer[platform.name]
                            :
                            deepLinks.externalPlayer.playlist
                        :
                        deepLinks.player
                :
                deepLinks.player
            :
            null;
    }, [deepLinks]);

    const download = React.useMemo(() => {
        return href === deepLinks?.externalPlayer?.playlist ?
            deepLinks.externalPlayer.fileName
            :
            null;
    }, [href, deepLinks]);

    const target = React.useMemo(() => {
        return href === deepLinks?.externalPlayer?.web ?
            '_blank'
            :
            null;
    }, [href, deepLinks]);

    const streamLink = React.useMemo(() => {
        return deepLinks?.externalPlayer?.streaming;
    }, [deepLinks]);

    const downloadLink = React.useMemo(() => {
        return deepLinks?.externalPlayer?.download;
    }, [deepLinks]);

    const markVideoAsWatched = React.useCallback(() => {
        if (typeof videoId === 'string') {
            core.transport.dispatch({
                action: 'MetaDetails',
                args: {
                    action: 'MarkVideoAsWatched',
                    args: [{ id: videoId, released: videoReleased }, true]
                }
            });
        }
    }, [videoId, videoReleased]);

    const onClick = React.useCallback((event) => {
        if (profile.settings.playerType !== null) {
            markVideoAsWatched();
            toast.show({
                type: 'success',
                title: 'Stream opened in external player',
                timeout: 4000
            });
        }

        if (typeof props.onClick === 'function') {
            props.onClick(event);
        }
    }, [props.onClick, profile.settings, markVideoAsWatched]);

    const copyDownloadLink = React.useCallback((event) => {
        event.preventDefault();
        closeMenu();
        if (downloadLink) {
            navigator.clipboard.writeText(downloadLink)
                .then(() => {
                    toast.show({
                        type: 'success',
                        title: t('PLAYER_COPY_DOWNLOAD_LINK_SUCCESS'),
                        timeout: 4000
                    });
                })
                .catch(() => {
                    toast.show({
                        type: 'error',
                        title: t('PLAYER_COPY_DOWNLOAD_LINK_ERROR'),
                        timeout: 4000,
                    });
                });
        }
    }, [downloadLink]);

    const copyStreamLink = React.useCallback((event) => {
        event.preventDefault();
        closeMenu();
        if (streamLink) {
            navigator.clipboard.writeText(streamLink)
                .then(() => {
                    toast.show({
                        type: 'success',
                        title: t('PLAYER_COPY_STREAM_SUCCESS'),
                        timeout: 4000
                    });
                })
                .catch(() => {
                    toast.show({
                        type: 'error',
                        title: t('PLAYER_COPY_STREAM_ERROR'),
                        timeout: 4000,
                    });
                });
        }
    }, [streamLink]);

    const queueLabel = React.useMemo(() => {
        if (!torrentClientType) return '';
        const clientName = torrentClientType.charAt(0).toUpperCase() + torrentClientType.slice(1);
        return t('TORRENT_QUEUE_DOWNLOAD', { defaultValue: `Queue in ${clientName}`, client: clientName });
    }, [torrentClientType]);

    const onQueueDownload = React.useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!infoHash) return;

        const params = [`xt=urn:btih:${infoHash}`];
        const displayName = description ? description.split('\n')[0].trim() : name;
        if (displayName) params.push(`dn=${encodeURIComponent(displayName)}`);
        if (Array.isArray(sources)) {
            sources.forEach((src) => {
                if (typeof src === 'string' && src.startsWith('tracker:')) {
                    params.push(`tr=${encodeURIComponent(src.replace('tracker:', ''))}`);
                }
            });
        }
        const magnet = `magnet:?${params.join('&')}`;

        const body = { magnet };
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
                    toast.show({
                        type: 'success',
                        title: t('TORRENT_QUEUED', { defaultValue: 'Download queued' }),
                        message: added?.name || name || infoHash,
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
    }, [infoHash, name, description, sources, contentType, toast]);

    const onQueueDownloadKeyDown = React.useCallback((event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            onQueueDownload(event);
        }
    }, [onQueueDownload]);

    const renderThumbnailFallback = React.useCallback(() => (
        <Icon className={styles['placeholder-icon']} name={'ic_broken_link'} />
    ), []);

    const renderLabel = React.useMemo(() => function renderLabel({ className, children, ...props }) {
        return (
            <Button className={classnames(className, styles['stream-container'])} title={addonName} href={href} target={target} download={download} onClick={onClick} {...props}>
                <div className={styles['info-container']}>
                    {
                        typeof thumbnail === 'string' && thumbnail.length > 0 ?
                            <div className={styles['thumbnail-container']} title={name || addonName}>
                                <Image
                                    className={styles['thumbnail']}
                                    src={thumbnail}
                                    alt={' '}
                                    renderFallback={renderThumbnailFallback}
                                />
                            </div>
                            :
                            <div className={styles['addon-name-container']} title={name || addonName}>
                                <div className={styles['addon-name']}>{name || addonName}</div>
                            </div>
                    }
                    {
                        progress !== null && !isNaN(progress) && progress > 0 ?
                            <div className={styles['progress-bar-container']}>
                                <div className={styles['progress-bar']} style={{ width: `${progress}%` }} />
                                <div className={styles['progress-bar-background']} />
                            </div>
                            :
                            null
                    }
                </div>
                <div className={styles['description-container']} title={description}>{description}</div>
                <div className={styles['actions-container']}>
                    {
                        torrentClientEnabled && isTorrentStream ?
                            <div
                                className={styles['download-button']}
                                title={queueLabel}
                                role={'button'}
                                tabIndex={0}
                                onClick={onQueueDownload}
                                onKeyDown={onQueueDownloadKeyDown}
                            >
                                <Icon className={styles['action-icon']} name={'download'} />
                            </div>
                            :
                            null
                    }
                    <Icon className={styles['icon']} name={'play'} />
                </div>
                {children}
            </Button>
        );
    }, [thumbnail, progress, addonName, name, description, href, target, download, onClick, torrentClientEnabled, isTorrentStream, queueLabel, onQueueDownload, onQueueDownloadKeyDown]);

    const renderMenu = React.useMemo(() => function renderMenu() {
        return (
            <div className={styles['context-menu-content']} onPointerDown={popupMenuOnPointerDown} onContextMenu={popupMenuOnContextMenu} onClick={popupMenuOnClick} onKeyDown={popupMenuOnKeyDown}>
                <div className={styles['context-menu-title']}>
                    {description}
                </div>
                <Button className={styles['context-menu-option-container']} title={t('CTX_PLAY')}>
                    <Icon className={styles['menu-icon']} name={'play'} />
                    <div className={styles['context-menu-option-label']}>{t('CTX_PLAY')}</div>
                </Button>
                {
                    streamLink &&
                        <Button className={styles['context-menu-option-container']} title={t('CTX_COPY_STREAM_LINK')} onClick={copyStreamLink}>
                            <Icon className={styles['menu-icon']} name={'link'} />
                            <div className={styles['context-menu-option-label']}>{t('CTX_COPY_STREAM_LINK')}</div>
                        </Button>
                }
                {
                    downloadLink &&
                        <Button className={styles['context-menu-option-container']} title={t('CTX_DOWNLOAD_VIDEO')} onClick={copyDownloadLink}>
                            <Icon className={styles['menu-icon']} name={'download'} />
                            <div className={styles['context-menu-option-label']}>{t('CTX_COPY_VIDEO_DOWNLOAD_LINK')}</div>
                        </Button>
                }
                {
                    torrentClientEnabled && isTorrentStream &&
                        <Button className={styles['context-menu-option-container']} title={queueLabel} onClick={onQueueDownload}>
                            <Icon className={styles['menu-icon']} name={'ic_downloads'} />
                            <div className={styles['context-menu-option-label']}>{queueLabel}</div>
                        </Button>
                }
            </div>
        );
    }, [description, streamLink, downloadLink, copyStreamLink, copyDownloadLink, torrentClientEnabled, isTorrentStream, queueLabel, onQueueDownload]);

    React.useEffect(() => {
        if (!routeFocused) {
            closeMenu();
        }
    }, [routeFocused]);

    return (
        <Popup
            className={className}
            onMouseUp={popupLabelOnMouseUp}
            onLongPress={popupLabelOnLongPress}
            onContextMenu={popupLabelOnContextMenu}
            open={menuOpen}
            onCloseRequest={closeMenu}
            renderLabel={renderLabel}
            renderMenu={renderMenu}
        />
    );
};

Stream.Placeholder = StreamPlaceholder;

Stream.propTypes = {
    className: PropTypes.string,
    videoId: PropTypes.string,
    videoReleased: PropTypes.instanceOf(Date),
    addonName: PropTypes.string,
    name: PropTypes.string,
    description: PropTypes.string,
    thumbnail: PropTypes.string,
    progress: PropTypes.number,
    deepLinks: PropTypes.shape({
        player: PropTypes.string,
        externalPlayer: PropTypes.shape({
            download: PropTypes.string,
            streaming: PropTypes.string,
            playlist: PropTypes.string,
            fileName: PropTypes.string,
            web: PropTypes.string,
            openPlayer: PropTypes.shape({
                ios: PropTypes.string,
                android: PropTypes.string,
                windows: PropTypes.string,
                macos: PropTypes.string,
                linux: PropTypes.string,
            })
        })
    }),
    infoHash: PropTypes.string,
    sources: PropTypes.array,
    contentType: PropTypes.string,
    onClick: PropTypes.func
};

module.exports = Stream;
