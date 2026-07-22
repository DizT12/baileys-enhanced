use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageReader, Limits};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tsify::Tsify;
use wasm_bindgen::prelude::*;

const JPEG_QUALITY: u8 = 50;
const MAX_IMAGE_DIMENSION: u32 = 8_192;
const MAX_IMAGE_ALLOCATION: u64 = 256 * 1024 * 1024;

/// Original image dimensions
#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct ImageDimensions {
    pub width: u32,
    pub height: u32,
}

/// Result of extracting an image thumbnail
#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct ImageThumbResult {
    #[tsify(type = "Uint8Array")]
    #[serde(with = "serde_bytes")]
    pub buffer: Vec<u8>,
    pub original: ImageDimensions,
}

/// Result of generating a profile picture
#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct ProfilePictureResult {
    #[tsify(type = "Uint8Array")]
    #[serde(with = "serde_bytes")]
    pub img: Vec<u8>,
}

#[wasm_bindgen(js_name = extractImageThumb)]
pub fn extract_image_thumb(image_data: &[u8], width: u32) -> Result<ImageThumbResult, JsValue> {
    validate_dimension("width", width)?;

    let img = load_image(image_data)?;
    let (orig_width, orig_height) = img.dimensions();
    let resized = img.resize(width, width, FilterType::Triangle);
    let jpeg = encode_jpeg(&resized)?;

    Ok(ImageThumbResult {
        buffer: jpeg,
        original: ImageDimensions {
            width: orig_width,
            height: orig_height,
        },
    })
}

#[wasm_bindgen(js_name = generateProfilePicture)]
pub fn generate_profile_picture(
    image_data: &[u8],
    target_width: u32,
) -> Result<ProfilePictureResult, JsValue> {
    validate_dimension("target width", target_width)?;

    let resized =
        load_image(image_data)?.resize_to_fill(target_width, target_width, FilterType::Triangle);
    let jpeg = encode_jpeg(&resized)?;

    Ok(ProfilePictureResult { img: jpeg })
}

fn load_image(image_data: &[u8]) -> Result<DynamicImage, JsValue> {
    let mut reader = ImageReader::new(Cursor::new(image_data))
        .with_guessed_format()
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {e}")))?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    limits.max_alloc = Some(MAX_IMAGE_ALLOCATION);
    reader.limits(limits);

    let image = reader
        .decode()
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {e}")))?;
    let (width, height) = image.dimensions();
    validate_dimension("image width", width)?;
    validate_dimension("image height", height)?;

    Ok(image)
}

fn validate_dimension(name: &str, value: u32) -> Result<(), JsValue> {
    if value == 0 {
        return Err(JsValue::from_str(&format!(
            "{name} must be greater than zero"
        )));
    }

    if value > MAX_IMAGE_DIMENSION {
        return Err(JsValue::from_str(&format!(
            "{name} must not exceed {MAX_IMAGE_DIMENSION} pixels"
        )));
    }

    Ok(())
}

fn scaled_dimension(source_primary: u32, source_secondary: u32, target: u32) -> u64 {
    u64::from(source_secondary)
        .saturating_mul(u64::from(target))
        .div_ceil(u64::from(source_primary))
}

fn validate_scaled_dimension(name: &str, value: u64) -> Result<u32, JsValue> {
    if value > u64::from(MAX_IMAGE_DIMENSION) {
        return Err(JsValue::from_str(&format!(
            "scaled {name} must not exceed {MAX_IMAGE_DIMENSION} pixels"
        )));
    }

    Ok(value as u32)
}

fn encode_jpeg(image: &DynamicImage) -> Result<Vec<u8>, JsValue> {
    encode_jpeg_quality(image, JPEG_QUALITY)
}

/// Output format for image processing
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    Jpeg,
    Png,
    WebP,
}

/// Options for image processing
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[tsify(from_wasm_abi)]
pub struct ProcessImageOptions {
    /// Target width (optional, maintains aspect ratio if only width is set)
    #[tsify(optional)]
    pub width: Option<u32>,
    /// Target height (optional, maintains aspect ratio if only height is set)
    #[tsify(optional)]
    pub height: Option<u32>,
    /// Output format
    pub format: ImageFormat,
    /// JPEG quality from 1-100, default 80. Ignored for PNG and lossless WebP.
    #[tsify(optional)]
    pub quality: Option<u8>,
}

/// Result of image processing
#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct ProcessImageResult {
    #[tsify(type = "Uint8Array")]
    #[serde(with = "serde_bytes")]
    pub buffer: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Get decoded image dimensions with the same resource limits as other image operations
#[wasm_bindgen(js_name = getImageDimensions)]
pub fn get_image_dimensions(image_data: &[u8]) -> Result<ImageDimensions, JsValue> {
    let img = load_image(image_data)?;
    let (width, height) = img.dimensions();
    Ok(ImageDimensions { width, height })
}

/// Convert any image to WebP format
#[wasm_bindgen(js_name = convertToWebP)]
pub fn convert_to_webp(image_data: Vec<u8>) -> Result<js_sys::Uint8Array, JsValue> {
    let img = load_image(&image_data)?;
    let webp = encode_format(&img, image::ImageFormat::WebP)?;
    Ok(js_sys::Uint8Array::from(webp.as_slice()))
}

/// Process image with resize and format conversion options
#[wasm_bindgen(js_name = processImage)]
pub fn process_image(
    image_data: Vec<u8>,
    options: ProcessImageOptions,
) -> Result<ProcessImageResult, JsValue> {
    if let Some(width) = options.width {
        validate_dimension("width", width)?;
    }
    if let Some(height) = options.height {
        validate_dimension("height", height)?;
    }

    let img = load_image(&image_data)?;
    let (source_width, source_height) = img.dimensions();

    // Resize if dimensions are specified
    let processed = match (options.width, options.height) {
        (Some(w), Some(h)) => {
            // Both dimensions specified - resize to exact size
            img.resize_exact(w, h, FilterType::Triangle)
        }
        (Some(w), None) => {
            // Only width specified - maintain aspect ratio
            let height = validate_scaled_dimension(
                "height",
                scaled_dimension(source_width, source_height, w),
            )?;
            img.resize(w, height, FilterType::Triangle)
        }
        (None, Some(h)) => {
            // Only height specified - maintain aspect ratio
            let width = validate_scaled_dimension(
                "width",
                scaled_dimension(source_height, source_width, h),
            )?;
            img.resize(width, h, FilterType::Triangle)
        }
        (None, None) => {
            // No resize, just format conversion
            img
        }
    };

    let (width, height) = processed.dimensions();
    let buffer = match options.format {
        ImageFormat::Jpeg => {
            let quality = options.quality.unwrap_or(80).clamp(1, 100);
            encode_jpeg_quality(&processed, quality)?
        }
        ImageFormat::Png => encode_format(&processed, image::ImageFormat::Png)?,
        ImageFormat::WebP => encode_format(&processed, image::ImageFormat::WebP)?,
    };

    Ok(ProcessImageResult {
        buffer,
        width,
        height,
    })
}

fn encode_jpeg_quality(image: &DynamicImage, quality: u8) -> Result<Vec<u8>, JsValue> {
    let mut buffer = Cursor::new(Vec::new());
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, quality);
    encoder
        .encode_image(image)
        .map_err(|e| JsValue::from_str(&format!("Failed to encode JPEG: {e}")))?;
    Ok(buffer.into_inner())
}

fn encode_format(image: &DynamicImage, format: image::ImageFormat) -> Result<Vec<u8>, JsValue> {
    let mut buffer = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut buffer), format)
        .map_err(|e| JsValue::from_str(&format!("Failed to encode image: {e}")))?;
    Ok(buffer)
}
