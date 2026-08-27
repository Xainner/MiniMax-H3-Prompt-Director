use super::client;
use super::types::{ChatMessage, ImageUrl, Part};
use crate::error::{AppError, AppResult};
use crate::settings::Profile;
use serde::{Deserialize, Serialize};

/// The vision pass exists to feed MiniMax H3 the attributes it needs to keep
/// identity stable, so the schema mirrors the guide's retention vocabulary
/// rather than being a generic image caption.
const SYSTEM: &str = r#"You are a reference analyst for MiniMax H3 video prompting.

You receive ONE reference image. Describe only what is actually visible. Never invent details you cannot see. Never guess names, brands, or locations.

Reply with a single JSON object and nothing else. No markdown fences, no commentary.

Schema:
{
  "summary": "one English sentence naming what this image can be reused as",
  "subjectType": "person" | "object" | "environment" | "logo" | "interface" | "artwork" | "product" | "other",
  "identity": "for people/animals: exact facial geometry, eye shape, nose, lips, jawline, skin tone, hairstyle, hairline, apparent age, body proportions. Empty string if not applicable.",
  "wardrobe": "clothing, colors, materials, accessories. Empty string if not applicable.",
  "objects": ["distinct reusable objects visible"],
  "environment": "setting, background, depth cues",
  "lighting": "direction, quality, color temperature, contrast",
  "palette": ["dominant colors as plain English names or hex"],
  "composition": "framing, subject placement, camera angle, lens character",
  "style": "visual/rendering style",
  "visibleText": ["every readable string, transcribed EXACTLY, preserving language, case, accents and punctuation"],
  "h3AttributeLine": "an English clause listing the attributes worth preserving, phrased to slot after 'preserving' in a <Subject N> definition"
}

Rules:
- Write every field in English EXCEPT visibleText, which must be transcribed verbatim in its original language.
- If a field does not apply, use an empty string or an empty array. Never use null.
- Be concrete and physical. Avoid mood words like "beautiful" or "professional"."#;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct VisionAnalysis {
    pub summary: String,
    pub subject_type: String,
    pub identity: String,
    pub wardrobe: String,
    pub objects: Vec<String>,
    pub environment: String,
    pub lighting: String,
    pub palette: Vec<String>,
    pub composition: String,
    pub style: String,
    pub visible_text: Vec<String>,
    pub h3_attribute_line: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionResult {
    #[serde(flatten)]
    pub analysis: VisionAnalysis,
    /// True when the result came from the local cache instead of the provider.
    pub cached: bool,
}

pub async fn analyze(
    profile: &Profile,
    api_key: &str,
    image_data_url: String,
    user_hint: Option<String>,
) -> AppResult<VisionAnalysis> {
    let mut parts = vec![Part::ImageUrl {
        image_url: ImageUrl {
            url: image_data_url,
        },
    }];

    let instruction = match user_hint.as_deref().map(str::trim) {
        Some(hint) if !hint.is_empty() => format!(
            "Analyze this reference image. The user will use it for: {hint}\nReturn the JSON object."
        ),
        _ => "Analyze this reference image. Return the JSON object.".to_string(),
    };
    parts.push(Part::Text { text: instruction });

    let messages = [ChatMessage::system(SYSTEM), ChatMessage::user_parts(parts)];

    // Low temperature: this pass is extraction, not creative writing.
    let raw = client::complete(profile, api_key, &messages, Some(0.1)).await?;
    parse(&raw)
}

/// Models wrap JSON in fences, prefix it with prose, or append a trailing note.
/// Recover the object instead of failing the whole analysis.
pub fn parse(raw: &str) -> AppResult<VisionAnalysis> {
    let cleaned = strip_fences(raw);
    if let Ok(v) = serde_json::from_str::<VisionAnalysis>(cleaned) {
        return Ok(v);
    }
    let start = cleaned.find('{').ok_or(AppError::MalformedModelJson)?;
    let end = cleaned.rfind('}').ok_or(AppError::MalformedModelJson)?;
    if end <= start {
        return Err(AppError::MalformedModelJson);
    }
    serde_json::from_str::<VisionAnalysis>(&cleaned[start..=end])
        .map_err(|_| AppError::MalformedModelJson)
}

fn strip_fences(raw: &str) -> &str {
    let trimmed = raw.trim();
    let Some(rest) = trimmed.strip_prefix("```") else {
        return trimmed;
    };
    // Drop an optional language tag on the opening fence.
    let rest = rest.strip_prefix("json").unwrap_or(rest);
    let rest = rest.trim_start_matches(['\r', '\n']);
    rest.strip_suffix("```").unwrap_or(rest).trim()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fenced_json() {
        let raw = "```json\n{\"summary\":\"a woman\",\"objects\":[\"bag\"]}\n```";
        let parsed = parse(raw).unwrap();
        assert_eq!(parsed.summary, "a woman");
        assert_eq!(parsed.objects, vec!["bag"]);
    }

    #[test]
    fn recovers_json_surrounded_by_prose() {
        let raw = "Here you go:\n{\"summary\":\"a logo\"}\nHope that helps!";
        assert_eq!(parse(raw).unwrap().summary, "a logo");
    }

    #[test]
    fn missing_fields_default_instead_of_failing() {
        let parsed = parse("{\"summary\":\"x\"}").unwrap();
        assert!(parsed.identity.is_empty());
        assert!(parsed.visible_text.is_empty());
    }

    #[test]
    fn rejects_non_json() {
        assert!(parse("no puedo analizar esta imagen").is_err());
    }
}
