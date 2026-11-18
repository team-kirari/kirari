'use client';


import { memo, useCallback, type SyntheticEvent } from 'react';
import { logImageDimensionsAllowed } from '../lib/trpg-media';

type Props = {
  src: string;
  alt: string;
  className: string;
  onLoaded: (source: string) => void;
  onFailed: (source: string) => void;
  onRatio?: (source: string, ratio: number) => void;
};

// Next Image reassigns img.src when its error-handler ref changes. Keep both
// handlers stable so unrelated scene updates cannot restart GIF/APNG playback.
export default memo(function CinematicSceneImage({ src, alt, className, onLoaded, onFailed, onRatio }: Props) {
  const handleLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (!logImageDimensionsAllowed(image.naturalWidth, image.naturalHeight)) { onFailed(src); return; }
    onLoaded(src);
    if (onRatio && image.naturalWidth > 0) onRatio(src, image.naturalHeight / image.naturalWidth);
  }, [src, onLoaded, onRatio, onFailed]);
  const handleError = useCallback(() => onFailed(src), [src, onFailed]);

  return <img src={src} alt={alt} referrerPolicy="no-referrer" className={`absolute inset-0 h-full w-full ${className}`} onLoad={handleLoad} onError={handleError} />;
});
