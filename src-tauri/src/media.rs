use crate::error::{AppError, AppResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::imageops::FilterType;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{BufReader, Cursor, Read};
use std::path::Path;

const IMAGE_EXT: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "avif", "jfif",
];
const VIDEO_EXT: &[&str] = &["mp4", "mov", "mkv", "webm", "avi", "m4v", "mpg", "mpeg", "wmv"];
const AUDIO_EXT: &[&str] = &["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus", "wma", "aiff"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Image,
    Video,
    Audio,
    Unknown,
}

pub fn kind_of(path: &Path) -> MediaKind {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if IMAGE_EXT.contains(&ext.as_str()) {
        MediaKind::Image
    } else if VIDEO_EXT.contains(&ext.as_str()) {
        MediaKind::Video
    } else if AUDIO_EXT.contains(&ext.as_str()) {
        MediaKind::Audio
    } else {
        MediaKind::Unknown
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    /// sha256 of the file bytes — stable id and vision-cache key.
    pub hash: String,
    pub path: String,
    pub file_name: String,
    pub kind: MediaKind,
    pub size_bytes: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Small JPEG data URL for the reference rail. `None` for video/audio.
    pub thumbnail: Option<String>,
}

pub fn inspect(path_str: &str) -> AppResult<MediaInfo> {
    let path = Path::new(path_str);
    let meta = std::fs::metadata(path).map_err(|e| AppError::FileRead {
        path: path_str.to_string(),
        source: e,
    })?;

    let kind = kind_of(path);
    let hash = hash_file(path)?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("archivo")
        .to_string();

    let (width, height, thumbnail) = if kind == MediaKind::Image {
        let img = decode(path)?;
        let (w, h) = (img.width(), img.height());
        let thumb = encode_jpeg(&img.resize(320, 320, FilterType::Lanczos3), 78)?;
        (Some(w), Some(h), Some(to_data_url("image/jpeg", &thumb)))
    } else {
        (None, None, None)
    };

    Ok(MediaInfo {
        hash,
        path: path_str.to_string(),
        file_name,
        kind,
        size_bytes: meta.len(),
        width,
        height,
        thumbnail,
    })
}

/// Larger render for the lightbox. Generated on demand so nothing full-res
/// ever sits in the webview.
pub fn preview(path_str: &str, max_px: u32) -> AppResult<String> {
    let img = decode(Path::new(path_str))?;
    let max_px = max_px.clamp(256, 2560);
    let resized = img.resize(max_px, max_px, FilterType::Lanczos3);
    Ok(to_data_url("image/jpeg", &encode_jpeg(&resized, 88)?))
}

/// What gets sent to the vision model: bounded resolution keeps token cost and
/// latency predictable regardless of the source file.
pub fn for_vision(path_str: &str, max_px: u32) -> AppResult<String> {
    let img = decode(Path::new(path_str))?;
    let resized = img.resize(max_px, max_px, FilterType::Lanczos3);
    Ok(to_data_url("image/jpeg", &encode_jpeg(&resized, 85)?))
}

fn decode(path: &Path) -> AppResult<image::DynamicImage> {
    image::open(path).map_err(|_| {
        AppError::UnsupportedImage(
            path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("archivo")
                .to_string(),
        )
    })
}

fn encode_jpeg(img: &image::DynamicImage, quality: u8) -> AppResult<Vec<u8>> {
    let rgb = img.to_rgb8();
    let mut buf = Vec::with_capacity(64 * 1024);
    let mut encoder =
        image::codecs::jpeg::JpegEncoder::new_with_quality(Cursor::new(&mut buf), quality);
    encoder
        .encode(&rgb, rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        .map_err(|e| AppError::Other(format!("no se pudo codificar la miniatura: {e}")))?;
    Ok(buf)
}

fn to_data_url(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture() -> PathBuf {
        // The app icon is a real PNG that ships with the repo.
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/128x128.png")
    }

    #[test]
    fn classifies_by_extension() {
        assert_eq!(kind_of(Path::new("a/b/c.JPG")), MediaKind::Image);
        assert_eq!(kind_of(Path::new("clip.mkv")), MediaKind::Video);
        assert_eq!(kind_of(Path::new("voz.m4a")), MediaKind::Audio);
        assert_eq!(kind_of(Path::new("notas.txt")), MediaKind::Unknown);
    }

    #[test]
    fn inspects_a_real_image() {
        let path = fixture();
        let info = inspect(path.to_str().unwrap()).expect("icon should be readable");

        assert_eq!(info.kind, MediaKind::Image);
        assert_eq!(info.hash.len(), 64, "sha256 hex");
        assert_eq!(info.width, Some(128));
        assert_eq!(info.height, Some(128));

        let thumb = info.thumbnail.expect("images get a thumbnail");
        assert!(thumb.starts_with("data:image/jpeg;base64,"));
        assert!(thumb.len() > 200);
    }

    #[test]
    fn hashing_is_stable() {
        let path = fixture();
        let a = inspect(path.to_str().unwrap()).unwrap();
        let b = inspect(path.to_str().unwrap()).unwrap();
        assert_eq!(a.hash, b.hash);
    }

    #[test]
    fn vision_payload_is_a_bounded_jpeg() {
        let path = fixture();
        let url = for_vision(path.to_str().unwrap(), 64).unwrap();
        assert!(url.starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn reports_a_missing_file_clearly() {
        let err = inspect("C:/definitivamente/no/existe.png").unwrap_err();
        assert!(err.to_string().contains("No se pudo leer"));
    }
}

fn hash_file(path: &Path) -> AppResult<String> {
    let file = std::fs::File::open(path).map_err(|e| AppError::FileRead {
        path: path.display().to_string(),
        source: e,
    })?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader.read(&mut buf).map_err(|e| AppError::FileRead {
            path: path.display().to_string(),
            source: e,
        })?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
