# Director

Generador de prompts profesionales para **MiniMax H3**. Cargás referencias, describís la idea, y la app devuelve un prompt con las seis secciones del modo Full-Reference correctamente formadas y validadas contra el checklist de la guía oficial.

La diferencia con pedírselo a un chat: acá el modelo **solo escribe prosa**. Las seis secciones, la numeración de `<Subject N>` / `<Picture N>` / `<Video N>` / `<Audio N>`, los headers `[Shot N]`, los timestamps y las líneas de diálogo las emite la app de forma determinista. Después valida el resultado contra 20+ reglas del checklist antes de mostrarlo.

## Qué hace

- **Referencias**: arrastrás imágenes, video y audio. Las imágenes las analiza un LLM de visión y extrae identidad, vestuario, luz, composición, paleta y texto visible. Video y audio se describen a mano.
- **Subjects**: definís contenido visual reutilizable que puede combinar varias fuentes (identidad de una imagen, ropa de otra, movimiento de un video).
- **Timeline**: shots con timestamps reales y líneas de diálogo con hablante, actuación, voice-over, `<scenetrans>` y `<cutoff>`.
- **Modos**: Full-Reference / Omni, T2VA, I2VA, FL2VA, L2VA — detectados automáticamente según los roles de las referencias — más el generador multi-window de Maestro.
- **Validación**: `[Shot 1]` sin timestamp, timestamps crecientes y dentro de la duración, `<d>` balanceados, actuación fuera del tag, speaker IDs estables, referencias definidas antes de usarse, texto visible dentro de la lista permitida, densidad de cortes y de diálogo.
- **Reparación**: si algo falla, un segundo pase le manda al modelo el prompt y la lista exacta de violaciones.

## Requisitos

- Windows 10/11 con WebView2
- Node 20+ y pnpm
- Rust estable (1.85+)
- Un endpoint compatible con OpenAI para cada rol: visión y escritura. Sirve OpenAI, OpenRouter, Groq, LM Studio, Ollama, vLLM o cualquier otro con la misma API.

## Uso

```bash
pnpm install
```

```bash
pnpm tauri dev
```

En **Ajustes** hay que configurar **los dos modelos**, cada uno en su pestaña:

- **Visión** — lee las imágenes de referencia. Tiene que ser un modelo multimodal.
- **Mejora de prompt** — escribe la prosa. Puede ser cualquier modelo de texto.

Cada uno lleva base URL, modelo y —si el proveedor lo pide— API key. Si usás el mismo proveedor para ambos, la pestaña *Mejora de prompt* tiene un botón **Copiar de Visión** que clona endpoint, modelo y credencial (la key se copia dentro de Rust: nunca pasa por el frontend).

El botón *Probar conexión* hace una llamada real. En el perfil de Visión el sondeo incluye una imagen, así que también comprueba que el modelo pueda verla y no solo que el endpoint responda.

## Seguridad

- Las API keys se guardan en el **Administrador de credenciales de Windows**, nunca en la base de datos ni en el frontend. Todas las llamadas HTTP salen del proceso Rust; el webview solo sabe si existe una key.
- Los archivos originales no entran al webview: Rust genera miniaturas y previews acotadas y las entrega como data URLs. No se habilita el asset protocol ni un scope de filesystem.
- La app avisa si configurás una base URL `http://` hacia un host remoto, porque la key y tus imágenes viajarían sin cifrar.

## Atajos

| Atajo | Acción |
|---|---|
| `Ctrl K` | Paleta de comandos |
| `Ctrl ⏎` o `G` | Generar prompt |
| `Ctrl O` | Agregar referencias |
| `Ctrl S` | Guardar proyecto |
| `Ctrl ⇧ C` | Copiar prompt |
| `Ctrl ,` | Ajustes |
| `Esc` | Cerrar overlays |

## Documentación

- [Guía de prompting de MiniMax H3](docs/MiniMax_H3_Prompting_Guide_ES.md) — el formato que la app implementa
- [Guía de stack multimedia en Tauri](docs/AGENTS_multimedia_tauri.md) — las reglas de dependencias del proyecto
