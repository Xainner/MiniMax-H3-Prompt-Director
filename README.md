<div align="center">

<img src="src/assets/brand/logo.png" alt="Director" width="160" />

# Director

**Convierte una idea y referencias visuales en un prompt de [MiniMax H3](https://github.com/MiniMax-AI/MiniMax-H3) estructurado y validado.**

Una app de escritorio para dirigir videos con IA como se dirige una producción: launcher de modos, wizard de proyecto, taller con referencias y timeline, y generación individual o orquestada con Maestro.

[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://v2.tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org)
![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)

</div>

---

## Por qué Director

Pedirle el prompt a un chat es una moneda al aire: el modelo inventa estructura, repite secciones, pierde sujetos y alucina texto. Director invierte el problema — **el modelo solo escribe prosa, la estructura la impone TypeScript**.

- Las seis secciones del formato H3, la numeración `<Subject N>` / `<Picture N>` / `<Video N>` / `<Audio N>`, los headers `[Shot N]`, los timestamps y las líneas de diálogo las emite un renderer determinista (`src/core/h3/render.ts`), no el LLM.
- Ninguna referencia cargada puede desaparecer del prompt: si nada la reclama, el motor deriva su Subject automáticamente.
- Antes de mostrarte nada, el resultado pasa por el checklist de la §45 de la guía oficial hecho código ejecutable (`validate.ts`, 20+ reglas). Si algo falla, un segundo pase de reparación le devuelve al modelo el prompt con la lista exacta de violaciones.

## Características

- **Launcher de modos H3** — cinco tarjetas: `OMNI` (Full-Reference), `T2VA`, `I2VA`, `FL2VA` y `L2VA`. El modo se fija para todo el proyecto.
- **Wizard de creación** — modal animado que recolecta nombre, formato (9:16 / 16:9 / 1:1), duración, descripción y skill de estilo antes de crear nada.
- **Skills MiniMax H3** — catálogo con las 8 skills oficiales de estilo (*Minimalist Product Ad*, *3D Animation Short*, *Papercraft Stop-Motion*, *Brand Promo*, *Music Video + Subtitles*, *Co-op Game Intro*, *Paper Collage*, *Handdrawn Fusion*) más el modo General. Se navegan como carrusel y sus campos viajan al Brief.
- **Taller de producción** — rail de referencias, Brief, Subjects y Timeline en paneles redimensionables, con vista previa de frames y paleta de comandos.
- **Referencias inteligentes** — arrastrás imágenes, video y audio. Un LLM de visión extrae identidad, vestuario, luz, composición, paleta y texto visible; los resultados se cachean en SQLite por hash.
- **Timeline real** — shots con timestamps, diálogos con hablante y actuación, `<scenetrans>`, `<cutoff>`, cortes dentro del shot y sugerencias de cantidad según la duración (§12.3).
- **Dos motores de generación** — individual (una ventana, un prompt) u **orquestado con Maestro** (ver abajo).
- **Historial y proyectos** — todo persiste en SQLite: proyectos reanudables, historial de prompts, caché de visión y jobs de Maestro.

## Dos formas de generar

### Estudio — generación individual

El pipeline completo contra cualquier endpoint compatible con OpenAI (OpenAI, OpenRouter, Groq, LM Studio, Ollama, vLLM…):

```
Brief + Referencias → LLM escritor (prosa JSON) → parseo tolerante
  → renderer determinista (secciones, tags, timestamps, restricciones)
  → validador §45 → [pase de reparación si hay violaciones]
  → prompt final
```

Con streaming en vivo del resultado, cancelación y seed de video persistente para reproducir generaciones.

### Maestro — generación multi-window

[Maestro](https://github.com/MiniMax-AI/MiniMax-H3) orquesta generaciones largas partiendo el video en ventanas de frames con solapamiento. Director se conecta a tus instancias y lo maneja de punta a punta (§30–§31):

- **Instancias configurables** — registrás cada instancia por nombre y base URL; se descubren sus capacidades (fps, frames mín/máx/paso, solapamiento y resoluciones disponibles).
- **Geometría automática** — según la duración del proyecto y las capacidades de la instancia, la app computa las ventanas de frames, los solapamientos y la continuidad entre ventanas. No tenés que calcular nada.
- **LoRAs de la instancia** — el catálogo de LoRAs disponible se lee de la instancia y viaja con el job.
- **Jobs con ciclo de vida completo** — envío, progreso en vivo, estados (`queued` / `running` / `held`), cancelación, previsualización del resultado y descarga al proyecto como salida.

El mismo proyecto sirve para ambos caminos: escribí el prompt en el Estudio, o mandalo directo a una ventana Maestro.

## Requisitos

| Requisito | Detalle |
|---|---|
| Sistema operativo | Windows 10/11 con WebView2 |
| Node.js | 20+ con [pnpm](https://pnpm.io) |
| Rust | estable, 1.85+ |
| Endpoints | uno o más endpoints compatibles con OpenAI (visión y/o escritura) |

## Inicio rápido

```bash
pnpm install
pnpm tauri dev
```

En **Ajustes** configurá los perfiles, cada uno en su pestaña:

- **Visión** — modelo multimodal que lee las imágenes de referencia.
- **Mejora de prompt** — cualquier modelo de texto para la prosa. Si usás el mismo proveedor, **Copiar de Visión** clona el endpoint sin exponer la key.

El botón *Probar conexión* hace una llamada real; en Visión incluye una imagen para verificar que el modelo realmente la vea.

## Seguridad

- Las API keys se guardan en el **Administrador de credenciales de Windows**. Nunca en la base de datos ni en el webview — el frontend solo recibe un booleano `hasKey`. Todas las llamadas HTTP salen del proceso Rust.
- Los archivos originales tampoco entran al webview: Rust genera miniaturas y previews acotados como data URLs. Sin asset protocol ni scope de filesystem.
- La app advierte si configurás una base URL `http://` hacia un host remoto — key e imágenes viajarían sin cifrar.

## Atajos

| Atajo | Acción |
|---|---|
| `Ctrl K` | Paleta de comandos |
| `Ctrl ⏎` / `G` | Generar prompt |
| `Ctrl O` | Agregar referencias |
| `Ctrl S` | Guardar proyecto |
| `Ctrl ⇧ C` | Copiar prompt |
| `Ctrl ,` | Ajustes |
| `Esc` | Cerrar overlays |

## Arquitectura

```
┌────────────────────────── webview (React 19) ──────────────────────────┐
│  HomeView · WizardModal · WorkspaceView (Rail | Brief/Subjects/Timeline│
│  │  Output) · MaestroPanel · CommandPalette                            │
│  core/h3: render (determinista) · validate (§45) · assemble · plan     │
│           multiWindow (§30–31) · skills · roles                        │
└──────────────────────────────┬─────────────────────────────────────────┘
                        IPC (Tauri 2)
┌──────────────────────────────┴─────────────────────────────────────────┐
│  Rust: llm/client (HTTP + SSE + cancelación) · maestro (instancias,    │
│  jobs, uploads) · media (miniaturas/previews) · secrets (Windows       │
│  Credential Manager) · db (SQLite WAL)                                 │
└────────────────────────────────────────────────────────────────────────┘
```

| Ruta | Qué hace |
|---|---|
| `src/core/h3/render.ts` | Ensamblado determinista de las seis secciones |
| `src/core/h3/validate.ts` | Checklist §45 ejecutable |
| `src/core/h3/multiWindow.ts` | Generador Maestro (§30–31) |
| `src/core/h3/systemPrompt.ts` | Contrato de salida del LLM escritor |
| `src/core/h3/skills.ts` | Catálogo de skills oficiales |
| `src-tauri/src/llm/client.rs` | HTTP, streaming SSE, cancelación |
| `src-tauri/src/maestro.rs` | Instancias, capacidades, jobs y descargas |
| `src-tauri/src/secrets.rs` | API keys en el Credential Manager |
| `src-tauri/src/db.rs` | SQLite: proyectos, historial, caché |

## Pruebas

El suite del motor corre sin red:

```bash
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

El e2e del pipeline pega contra un endpoint real y se saltea solo si no hay nada escuchando:

```bash
H3_TEST_ENDPOINT=http://127.0.0.1:1234/v1 H3_TEST_MODEL=mi-modelo pnpm test
```

## Documentación

- [Guía de prompting de MiniMax H3](docs/MiniMax_H3_Prompting_Guide_ES.md) — el formato que la app implementa, sección por sección
- [Guía de stack multimedia en Tauri](docs/AGENTS_multimedia_tauri.md) — las reglas de dependencias del proyecto

---

<div align="center">

**Director** · hecho para dirigir, no para adivinar

</div>
