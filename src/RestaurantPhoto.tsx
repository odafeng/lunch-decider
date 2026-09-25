import { useState } from 'react';
import { Camera, ExternalLink, ImageOff } from 'lucide-react';
import type { Restaurant } from '../shared/types';

export function RestaurantPhoto({ restaurant, onDetails }: { restaurant: Restaurant; onDetails?: () => void }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { image, photo, name, source } = restaurant;
  const available = Boolean(image && failedUrl !== image);
  const visual = available ? <img
    src={image!}
    alt={source === 'demo' ? `${name}的料理示意，非店家照片` : `${name}的店家照片`}
    loading={onDetails ? 'lazy' : 'eager'}
    referrerPolicy="no-referrer"
    onError={() => setFailedUrl(image)}
  /> : <span className="photo-placeholder">
    {image ? <ImageOff size={27}/> : <Camera size={27}/>}
    <span>{image ? '照片暫時無法載入' : '尚無店家照片'}</span>
    <small>{image ? '重新搜尋可更新照片連結' : '店家資訊仍可查看'}</small>
  </span>;

  return <div className="restaurant-photo">
    {onDetails ? <button className="image-button" onClick={onDetails} aria-label={`查看 ${name} 詳細資訊`}>{visual}</button> : visual}
    {source === 'demo' && available && <span className="image-caption">料理示意</span>}
    {source === 'google' && available && photo && <div className="photo-credit">
      <span className="photo-credit-authors">{photo.authors.length ? photo.authors.map((author, index) => <span key={index}>
        {index > 0 && '、'}{author.profileUrl ? <a href={author.profileUrl} target="_blank" rel="noreferrer">{author.name}</a> : author.name}
      </span>) : <span translate="no">Google Maps</span>}</span>
      {photo.sourceUrl && <a className="photo-source-link" href={photo.sourceUrl} target="_blank" rel="noreferrer" aria-label={`在 Google Maps 查看${name}的原始照片`}><ExternalLink size={13}/></a>}
    </div>}
  </div>;
}

export function PhotoAttributions({ restaurant }: { restaurant: Restaurant }) {
  if (restaurant.source !== 'google' || !restaurant.photo) return null;
  return <div className="photo-attributions">
    <span className="photo-attributions-label">店家照片・<span translate="no">Google Maps</span></span>
    {restaurant.photo.authors.map((author, index) => <div className="photo-author" key={index}>
      {author.avatarUrl && <img src={author.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }}/>}
      {author.profileUrl ? <a href={author.profileUrl} target="_blank" rel="noreferrer">{author.name}</a> : <span>{author.name}</span>}
    </div>)}
    {restaurant.photo.sourceUrl && <a className="photo-original-link" href={restaurant.photo.sourceUrl} target="_blank" rel="noreferrer">查看原始照片<ExternalLink size={12}/></a>}
  </div>;
}
