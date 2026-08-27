use serde::{Serialize, Serializer};

/// Every failure surfaced to the frontend. Messages are user-facing Spanish
/// strings, never raw provider payloads (those can echo back the API key).
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("No hay una API key guardada para el perfil «{0}». Configurala en Ajustes.")]
    MissingApiKey(String),

    #[error("El perfil «{0}» no está configurado. Definí base URL y modelo en Ajustes.")]
    ProfileNotConfigured(String),

    #[error("La base URL debe empezar con http:// o https://")]
    InvalidBaseUrl,

    #[error("El proveedor respondió {status}: {message}")]
    Provider { status: u16, message: String },

    #[error("No se pudo contactar al proveedor: {0}")]
    Network(String),

    #[error("La respuesta del modelo no es JSON válido. Probá con otro modelo o bajá la temperatura.")]
    MalformedModelJson,

    #[error("La respuesta del modelo llegó vacía.")]
    EmptyCompletion,

    #[error("Operación cancelada.")]
    Cancelled,

    #[error("No se pudo leer «{path}»: {source}")]
    FileRead {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error("«{0}» no es un formato de imagen que se pueda decodificar.")]
    UnsupportedImage(String),

    #[error("Error de base de datos: {0}")]
    Database(String),

    #[error("Error del almacén de credenciales de Windows: {0}")]
    Keyring(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Database(e.to_string())
    }
}

impl From<keyring::Error> for AppError {
    fn from(e: keyring::Error) -> Self {
        AppError::Keyring(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(_: serde_json::Error) -> Self {
        AppError::MalformedModelJson
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            AppError::Network("se agotó el tiempo de espera".into())
        } else if e.is_connect() {
            AppError::Network("no se pudo abrir la conexión".into())
        } else {
            // `e.to_string()` on reqwest never contains headers, so no key leak.
            AppError::Network(e.to_string())
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
