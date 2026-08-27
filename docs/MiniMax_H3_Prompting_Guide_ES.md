# Guía avanzada de prompting para MiniMax H3

> Guía práctica para que un modelo de lenguaje pueda construir prompts correctos, consistentes y reutilizables para **MiniMax H3**, especialmente **Full-Reference / Omni**, y para trabajar con referencias de imagen, video, audio, diálogos, first/last frames y secuencias multi-window.

---

## 0. Objetivo de esta guía

Esta guía está pensada para usarse de dos maneras:

1. **Como documentación humana**, para entender cómo estructurar prompts de MiniMax H3.
2. **Como instrucción para otro LLM**, de forma que pueda recibir una idea, imágenes, videos y audios de referencia y devolver un prompt H3 bien formado.

La regla central es esta:

> **No trates las referencias como simples archivos. Define qué función cumple cada referencia dentro del video.**

MiniMax H3 distingue entre:

- contenido visual reutilizable;
- imágenes usadas como frames concretos;
- videos usados como fuente estructural o continuación;
- señales de audio;
- hablantes;
- diálogo;
- cortes;
- continuidad entre escenas.

Una buena escritura de prompt debe separar correctamente esos conceptos.

---

# 1. Modos principales de prompting

MiniMax H3 puede trabajar con distintos tipos de generación.

## 1.1 T2VA — Text to Video + Audio

No existe una imagen inicial o final obligatoria.

El prompt construye toda la línea temporal desde texto.

Estructura base:

```text
integrated_multimodal_description:
[Shot 1] ...

overall_soundscape:
...

non_diegetic_music:
...
```

---

## 1.2 I2VA — Image to Video + Audio

Una imagen define el **primer frame exacto** del video.

La primera línea debe establecer la alineación:

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
```

Después:

```text
integrated_multimodal_description:
[Shot 1] ...

overall_soundscape:
...

non_diegetic_music:
...
```

La acción debe desarrollarse **desde** esa imagen.

No describas una escena que contradiga el frame inicial.

---

## 1.3 FL2VA — First + Last Frame

Una imagen define el inicio y otra el final.

La prioridad es explicar **cómo se transforma el primer frame en el último**.

Formato de alineación:

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the X.XX-second mark of the target video.
```

Para movimientos continuos suele funcionar mejor **un solo shot**.

Ejemplo conceptual:

```text
Picture 1:
personaje con la mano abajo

→ movimiento intermedio descrito

Picture 2:
personaje con la mano arriba
```

No desperdicies el prompt describiendo dos imágenes estáticas. Describe el **camino visual entre ambas**.

---

## 1.4 L2VA — Last Frame

La imagen define únicamente el frame final.

Formato:

```text
How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the X.XX-second mark of the target video.
```

El modelo debe inferir un estado anterior plausible y luego converger naturalmente hacia la composición final.

---

# 2. Full-Reference / Omni

Full-Reference es el modo más importante cuando existen múltiples referencias.

Ejemplos:

- imagen para identidad;
- otra imagen para ropa;
- video para pose o movimiento;
- video para cámara;
- audio para voz;
- otra imagen para composición;
- logo;
- escenario;
- objetos específicos.

En Full-Reference el prompt completo debe contener **seis secciones** en este orden exacto:

```text
subject_definitions:

summary:

retention_analysis:

detailed_description:

overall_soundscape:

non_diegetic_music:
```

## Regla de idioma

Las seis secciones se escriben normalmente en **inglés**.

Se conserva el idioma original únicamente para:

- diálogo;
- letras de canciones;
- texto visible en pantalla.

Ejemplo:

```text
<Subject 1> (S1) smiles and says, <d>[Spanish] Hola, ¿cómo estás?</d>
```

---

# 3. Referencias y tags principales

Full-Reference utiliza cuatro tipos principales de referencias:

| Tag | Función |
|---|---|
| `<Subject N>` | Contenido visual reutilizable |
| `<Picture N>` | Imagen usada como frame o ancla de composición |
| `<Video N>` | Video usado como fuente completa, edición, continuación o estructura temporal |
| `<Audio N>` | Señal de audio copiada o usada como referencia |

La numeración es estable.

Una vez que:

```text
<Subject 1> = Laura
```

**Subject 1 siempre debe seguir siendo Laura.**

Nunca reutilices ese número para otra cosa.

---

# 4. `<Subject N>` — contenido visual reutilizable

`<Subject N>` representa una unidad visual que será usada dentro del video.

Puede ser:

- persona;
- personaje;
- animal;
- objeto;
- vehículo;
- producto;
- escenario;
- fondo;
- ropa;
- accesorio;
- interfaz;
- logo;
- efecto;
- estilo visual;
- acción;
- pose.

Ejemplo simple:

```text
<Subject 1> is the young woman from <Picture 1>, preserving her exact facial identity, long black hair, green eyes, facial proportions, and overall appearance.
```

## 4.1 Un Subject puede venir de varias referencias

Ejemplo:

```text
<Subject 1> is the woman whose facial identity and body appearance come from <Picture 1>, whose outfit comes from <Picture 2>, and whose walking motion is referenced from <Video 1>.
```

Esto permite separar claramente:

- identidad;
- vestuario;
- movimiento.

## 4.2 Una misma imagen puede definir varios Subjects

```text
<Subject 1> is the woman in <Picture 1>.
<Subject 2> is the motorcycle in <Picture 1>.
<Subject 3> is the red leather jacket visible in <Picture 1>.
```

## 4.3 No uses `<Picture N>` cada vez que aparece el personaje

Incorrecto:

```text
<Picture 1> walks into the room.
```

Mejor:

```text
<Subject 1> is the woman from <Picture 1>.
```

Luego:

```text
<Subject 1> walks into the room.
```

La imagen es la **fuente**. El Subject es el **contenido visual reutilizable**.

---

# 5. `<Picture N>` — frame o composición concreta

`<Picture N>` debe usarse directamente cuando la imagen tiene función propia como:

- first frame;
- last frame;
- keyframe;
- edited keyframe;
- composición;
- storyboard;
- referencia de posición;
- referencia de cámara.

Ejemplo:

```text
<Picture 2> is the exact final composition of [Shot 3], defining the camera angle, subject placement, lighting, and background layout.
```

Uso dentro del video:

```text
The shot begins from <Picture 1>.
```

```text
The shot's keyframe corresponds to <Picture 2>.
```

```text
The final composition progressively converges toward <Picture 3>.
```

```text
The shot ends on <Picture 3>.
```

## 5.1 Cuándo NO crear un Picture independiente

Si una imagen solo sirve para cara, personaje, ropa, logo, estilo u objeto, normalmente no hace falta una definición independiente.

Simplemente úsala como origen dentro del Subject:

```text
<Subject 1> is the exact DondeCR logo from <Picture 1>.
```

---

# 6. `<Video N>` — referencia de video completo

`<Video N>` representa una relación con el **video como secuencia completa**.

Usos comunes:

### Fuente para edición

```text
<Video 1> is the source video being edited.
```

### Continuación

```text
<Video 1> is the source video whose final audiovisual state is continued by the target video.
```

### Movimiento de cámara

```text
<Video 1> provides the camera movement and tracking behavior.
```

### Ritmo de edición

```text
<Video 1> provides the cut rhythm and temporal structure reference.
```

## 6.1 Personajes dentro de videos

Si quieres reutilizar una persona que aparece en un video:

```text
<Subject 1> is the woman visible in <Video 1>, preserving her facial identity, hairstyle, body proportions, and clothing.
```

El personaje sigue siendo un `<Subject N>`.

`<Video N>` no reemplaza al Subject.

---

# 7. `<Audio N>` — audio

`<Audio N>` representa audio independiente o audio habilitado procedente de una referencia.

Puede utilizarse para:

- copiar el soundtrack;
- copiar una sección;
- referencia de timbre de voz;
- referencia de ritmo;
- referencia de estilo musical;
- continuidad sonora;
- letra;
- diálogo;
- efectos de sonido.

Ejemplos:

```text
<Audio 1> is the exact soundtrack reused throughout the target video.
```

```text
<Audio 1> is the voice-timbre reference for <Subject 1> (S1).
```

```text
<Audio 2> provides only the musical rhythm, instrumentation, and energy reference without copying the original waveform.
```

## 7.1 Video y audio se numeran de manera independiente

Esto:

```text
<Video 1>
<Audio 1>
```

no implica que pertenezcan al mismo archivo.

Ejemplo explícito:

```text
<Video 1> is the original source video.
<Audio 2> is the synchronized soundtrack of <Video 1> and is reused in the target video.
```

---

# 8. `subject_definitions`

Esta sección registra todas las referencias importantes.

Template:

```text
subject_definitions:

<Subject 1> is [VISIBLE CONTENT], sourced from <Picture 1>, preserving [IMPORTANT ATTRIBUTES].

<Subject 2> is [VISIBLE CONTENT], sourced from <Video 1>, preserving [IMPORTANT ATTRIBUTES].

<Picture 2> is [FIRST FRAME / LAST FRAME / KEYFRAME / COMPOSITION ANCHOR] for [SHOT].

<Video 1> is [EDITING SOURCE / CONTINUATION SOURCE / CAMERA REFERENCE / TEMPORAL REFERENCE].

<Audio 1> is [VOICE / MUSIC / SOUNDTRACK / RHYTHM REFERENCE].
```

---

# 9. `summary`

Debe ser un resumen corto y comenzar con un **task-type prefix**.

Tipos:

```text
[keyframe completion]
[reference generation]
[video editing]
[video continuation]
[audio reuse]
[audio reference]
```

Pueden combinarse:

```text
[video continuation + keyframe completion]
```

```text
[video editing + audio reuse]
```

```text
[reference generation + audio reference]
```

## 9.1 Qué significa cada tipo

### `keyframe completion`
Cuando una imagen es first frame, keyframe, last frame, edited keyframe o frame concreto obligatorio.

### `reference generation`
Cuando una referencia aporta personaje, estilo, cámara, pose, acción, storyboard o ambiente sin ser necesariamente un frame exacto.

### `video editing`
Cuando se modifica directamente un video existente.

### `video continuation`
Cuando el video generado continúa desde el final de otro video.

### `audio reuse`
Cuando el mismo audio se copia directamente.

### `audio reference`
Cuando solo se utiliza timbre, ritmo, letra, estilo o textura sonora sin copiar exactamente la señal.

## 9.2 Ejemplo

```text
summary:

[reference generation + audio reference] The target video shows <Subject 1> walking through <Subject 2> while using <Video 1> as the motion reference. <Audio 1> provides the voice timbre for <Subject 1> (S1).
```

No inventes nuevos Subjects en esta sección.

---

# 10. `retention_analysis`

Indica qué tan fiel debe mantenerse cada referencia.

## 10.1 Referencias visuales

Valores válidos:

```text
fully_preserved
partially_preserved
attribute_transfer
weak_reference
```

### `fully_preserved`

```text
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - preserve the exact facial identity, hairstyle, outfit colors, and body proportions.
```

### `partially_preserved`

```text
<Subject 1>: partially_preserved - preserve facial identity and hairstyle while replacing the original clothing.
```

### `attribute_transfer`

```text
<Subject 2>: attribute_transfer - transfer the armor design and color palette onto the target character.
```

### `weak_reference`

```text
<Video 1> (camera rhythm): weak_reference - preserve only the energetic handheld pacing and rapid cut structure.
```

## 10.2 Audio

Valores:

```text
fully_copy
partially_copy
reference
weak_reference
```

Ejemplo:

```text
<Audio 1>: fully_copy - reuse the complete audio signal as the final soundtrack.
```

```text
<Audio 2>: reference - follow the vocal timbre and speaking cadence without copying the original audio.
```

---

# 11. `detailed_description`

Es la sección más importante.

Debe describir el video en **orden cronológico real**.

Antes de `[Shot 1]`, Full-Reference normalmente establece el estilo en una o dos frases.

```text
detailed_description:

The target video uses a premium cinematic advertising style with soft directional lighting, clean contrast, shallow depth of field, and restrained camera movement.
```

Después comienzan los shots.

---

# 12. `[Shot N]`

## 12.1 Shot 1

Nunca lleva timestamp.

Correcto:

```text
[Shot 1] A medium-wide shot shows...
```

Incorrecto:

```text
[Shot 1] At 00:00.000...
```

## 12.2 Shots siguientes

Usan timestamp de corte:

```text
[Shot 2] At 00:04.000, the camera cuts to...
```

```text
[Shot 3] At 00:08.500, the shot transitions to...
```

Los tiempos deben aumentar y permanecer dentro de la duración.

## 12.3 No abuses de cortes

Orientación práctica:

- 5 s: 1–2 shots;
- 10 s: 2–4 shots;
- 15 s: 3–5 shots.

No es una regla rígida. Si solo cambia ligeramente el encuadre, usa movimiento de cámara.

---

# 13. Cámara

MiniMax recomienda expresar cámara como acción natural.

Tres dimensiones posibles:

1. tipo;
2. amplitud;
3. velocidad.

## 13.1 Movimientos útiles

```text
The camera zooms in.
The camera pushes in toward <Subject 1>.
The camera slowly pulls out.
The camera pans right.
The camera trucks left alongside <Subject 1>.
The camera tilts upward.
The camera pedestals upward.
The camera performs a slow arc around <Subject 1>.
The camera tracks backward while <Subject 1> walks forward.
The camera holds a static shot.
The shot changes to <Subject 1>'s POV.
The camera rolls clockwise with small amplitude.
The camera shakes slightly during the impact.
```

## 13.2 Amplitud

```text
with small amplitude
with large amplitude
```

## 13.3 Velocidad

```text
at slow speed
at fast speed
```

Ejemplo completo:

```text
The camera pushes in with small amplitude at slow speed toward <Subject 1>.
```

## 13.4 Evita listas de keywords

Malo:

```text
cinematic, pan, zoom, tracking, dolly, camera movement
```

Bueno:

```text
The camera slowly tracks backward while <Subject 1> advances toward the lens, then performs a small pan right to reveal <Subject 2>.
```

---

# 14. Speakers `(S1)`, `(S2)`, `(S3)`

Los IDs `(Sx)` representan **fuentes vocales reales del video final**.

Ejemplo:

```text
<Subject 1> (S1)
<Subject 2> (S2)
```

Un personaje que no habla no necesita ID.

## 14.1 Numeración

Se asignan según el orden de eventos vocales.

Una vez asignado:

```text
Laura = S1
Luis = S2
```

deben mantenerse en todo el video.

## 14.2 Varias personas hablando juntas

```text
<Subject 1> and <Subject 2> (S1,S2) shout together, <d>[Spanish] ¡Vamos!</d>
```

---

# 15. `<d>[Language] ...</d>`

Todo diálogo o canto debe ir dentro del tag `<d>`.

```text
<d>[Spanish] Hola, ¿cómo estás?</d>
<d>[English] We have to leave now.</d>
<d>[Japanese] 行こう。</d>
```

## 15.1 Solo palabras habladas dentro de `<d>`

Correcto:

```text
<Subject 1> (S1) whispers nervously, <d>[Spanish] Creo que alguien está ahí.</d>
```

Incorrecto:

```text
<d>[Spanish, whispering nervously] Creo que alguien está ahí.</d>
```

La actuación va fuera. El contenido hablado va dentro.

## 15.2 No reescribir diálogo proporcionado

Si el usuario proporciona una frase literal, consérvala salvo que pida reescritura.

---

# 16. Voice-over

Para voice-over usa explícitamente:

```text
says in an off-screen voiceover
```

Ejemplo:

```text
A warm Latin-American female narrator (S1) says in an off-screen voiceover: <d>[Spanish] Descubrí nuevas oportunidades.</d>
```

Si hay un personaje visible relacionado con esa voz:

```text
<Subject 1> (S1) says in an off-screen voiceover: <d>[Spanish] Todo comenzó aquí.</d> while her lips remain completely closed.
```

Esto ayuda a evitar lip-sync accidental.

---

# 17. `<scenetrans>`

Usa `<scenetrans>` cuando una misma línea vocal cruza un corte o transición.

Ejemplo conceptual:

```text
<Subject 1> (S1) says, <d>[Spanish] Y fue entonces cuando <scenetrans>
```

Nuevo shot:

```text
[Shot 2] At 00:04.000, the audio continues seamlessly across the cut as <Subject 1> (S1) finishes, <d>[Spanish] <scenetrans> todo cambió.</d>
```

Debe quedar claro que el audio **continúa**.

Frases útiles:

```text
continues seamlessly across the cut
continues uninterrupted into the next shot
carries over from the previous shot
remains audible across the transition
```

No uses `<scenetrans>` si el diálogo ya terminó antes del corte.

---

# 18. `<cutoff>`

Úsalo cuando una línea se interrumpe intencionalmente.

```text
<Subject 1> (S1) shouts, <d>[Spanish] ¡No abras esa puerta porque... <cutoff></d>
```

Casos:

- fin abrupto;
- edición que corta una frase;
- interrupción deliberada.

No usar para frases completas.

---

# 19. Texto visible en pantalla

El texto visible se escribe entre comillas dobles.

```text
A large sign reading "DONDECR.COM" appears centered.
```

Conserva exactamente:

- idioma;
- mayúsculas;
- acentos;
- signos;
- puntuación.

---

# 20. Cómo controlar el texto generado

Los modelos de video pueden inventar microtexto dentro de interfaces.

En vez de pedir:

```text
a detailed business dashboard
```

es más seguro pedir:

```text
an icon-only abstract analytics panel made exclusively from large geometric shapes, a single eye icon, five stars, one message icon, and rising bars; no labels, no numbers, no text-like lines
```

## 20.1 Bloque fuerte anti-microtexto

```text
VISIBLE TEXT — HIGHEST PRIORITY:
The ONLY visible text allowed anywhere in the entire video is the exact phrase "PUBLICÁ TU NEGOCIO".

Absolutely no other written characters may appear:
no small text,
no microtext,
no UI labels,
no paragraphs,
no captions,
no product names,
no search-result text,
no numbers,
no percentages,
no prices,
no dates,
no random letters,
no gibberish,
no pseudo-text,
no decorative lettering,
and no thin placeholder lines that resemble text.

Any interface-like element must be icon-only and made from geometric shapes, large symbols, thumbnails, empty cards, stars, circles, bars, and solid blocks.
```

## 20.2 Si NO necesitas texto

```text
NO visible text or numbers anywhere in the video.
```

Comunica todo mediante iconos, fotografías, formas, motion graphics, colores, símbolos y composición.

---

# 21. Números

Si los números deben ser exactos, trátalos igual que texto.

```text
The ONLY numerical value visible is "25%".
```

Si no son necesarios:

```text
No numerical values, counters, percentages, prices, dates, ratings, or statistics appear anywhere.
```

---

# 22. `overall_soundscape`

Describe:

- ambiente;
- foley;
- impactos;
- pasos;
- tráfico;
- viento;
- respiración;
- objetos;
- notificaciones;
- sonidos físicos.

Normalmente 1–4 oraciones.

```text
overall_soundscape:
Soft indoor ambience continues throughout the scene. Light interface confirmation tones accompany the animated icons, while restrained transition whooshes follow the motion graphics.
```

No repitas aquí el diálogo.

---

# 23. `non_diegetic_music`

Es música que solo escucha el público.

Describe instrumentos, tempo, ritmo, evolución y dinámica.

```text
non_diegetic_music:
A modern electronic corporate score at approximately 115 BPM, built from a restrained synth pulse, light percussion, and soft bass. The arrangement gradually increases in density and resolves cleanly on the final frame.
```

Si no quieres música:

```text
non_diegetic_music:
N/A
```

---

# 24. Diegetic vs non-diegetic

### Diegetic
Existe físicamente dentro de la escena: radio, celular, banda, TV, persona cantando.

Debe describirse dentro de `detailed_description`.

### Non-diegetic
Solo la escucha la audiencia.

Va en `non_diegetic_music`.

---

# 25. Full-Reference template completo

```text
subject_definitions:

<Subject 1> is [MAIN VISIBLE SUBJECT] from <Picture 1>, preserving [IDENTITY / APPEARANCE / COLORS / CLOTHING / GEOMETRY / IMPORTANT FEATURES].

<Subject 2> is [SECOND SUBJECT] from <Picture 2>, preserving [IMPORTANT FEATURES].

<Picture 3> is the [FIRST FRAME / KEYFRAME / LAST FRAME / COMPOSITION ANCHOR] for [Shot N], defining [COMPOSITION DETAILS].

<Video 1> is the [SOURCE VIDEO / CONTINUATION SOURCE / MOTION REFERENCE / CAMERA STRUCTURE REFERENCE].

<Audio 1> is the [VOICE TIMBRE / EXACT SOUNDTRACK / RHYTHM / MUSIC STYLE] reference for [TARGET].

summary:

[reference generation + audio reference] The target video is a [DURATION]-second [ASPECT RATIO] [TYPE OF VIDEO]. <Subject 1> [MAIN ACTION]. <Subject 2> [SECONDARY ACTION]. <Picture 3> defines [FRAME ROLE], while <Video 1> provides [VIDEO ROLE] and <Audio 1> provides [AUDIO ROLE].

retention_analysis:

<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - preserve [IMPORTANT FEATURES].

<Subject 2> (appears in [Shot 2], [Shot 3]): fully_preserved - preserve [IMPORTANT FEATURES].

<Picture 3> ([Shot 3] final frame): fully_preserved - preserve the final camera angle, subject placement, lighting, and composition.

<Video 1> (motion and camera structure): weak_reference - preserve only the requested temporal and motion characteristics.

<Audio 1>: reference - reproduce the requested timbre and delivery without copying the source waveform.

detailed_description:

The target video uses [VISUAL STYLE], [LIGHTING], [COLOR PALETTE], [MOTION LANGUAGE], and [CAMERA CHARACTER].

[Shot 1] [COMPOSITION]. <Subject 1> [POSITION + ACTION]. The camera [CAMERA MOVEMENT]. [SOUND EVENT].

<Subject 1> (S1) [DELIVERY] says, <d>[Spanish] EXACT DIALOGUE.</d>

[Shot 2] At 00:XX.XXX, the camera cuts to [NEW COMPOSITION]. <Subject 2> [ACTION]. <Subject 1> [REACTION]. The camera [MOVEMENT].

<Subject 2> (S2) [DELIVERY] says, <d>[Spanish] EXACT DIALOGUE.</d>

[Shot 3] At 00:XX.XXX, [FINAL ACTION]. The composition progressively converges toward <Picture 3>. By the final moment, the framing, object positions, lighting, and subject arrangement closely match <Picture 3>.

overall_soundscape:

[AMBIENCE + PHYSICAL SOUNDS + FOLEY].

non_diegetic_music:

[MUSIC DESCRIPTION].
```

---

# 26. Ejemplo: persona + imagen de identidad + video de pose

Supongamos:

- Picture 1 = identidad de Laura;
- Video 1 = pose/movimiento;
- voz generada;
- 10 segundos.

```text
subject_definitions:

<Subject 1> is Laura, whose exact facial identity, hairstyle, body proportions, and clothing come from <Picture 1>, while her greeting gesture and upper-body motion are referenced from <Video 1>.

<Video 1> provides only the greeting gesture, body timing, and motion rhythm reference.

summary:

[reference generation] The target video is a 10-second vertical portrait clip of <Subject 1> performing the greeting motion referenced from <Video 1> while preserving her exact visual identity from <Picture 1>.

retention_analysis:

<Subject 1> (appears in [Shot 1]): fully_preserved - preserve Laura's exact facial identity, hairstyle, clothing, body proportions, and overall appearance from <Picture 1> while applying the requested greeting movement.

<Video 1> (gesture and motion rhythm): weak_reference - reuse only the greeting motion and timing without copying unrelated visual content.

detailed_description:

The target video uses a clean realistic social-media portrait aesthetic with soft flattering lighting and smooth natural motion.

[Shot 1] <Subject 1> stands centered in a medium portrait framing, preserving the appearance established by <Picture 1>. She smoothly performs the greeting gesture referenced from <Video 1>, raising one hand beside her face with relaxed fingers while making a small cheerful head tilt. Her body movement remains fluid and physically natural. The camera holds nearly static with only a subtle slow push-in.

<Subject 1> (S1) smiles warmly and says, <d>[Spanish] ¡Hola! Qué gusto verte.</d>

overall_soundscape:

Very soft room ambience with subtle clothing movement.

non_diegetic_music:

A light upbeat electronic melody at a moderate tempo, kept low beneath the voice.
```

---

# 27. Ejemplo: reemplazar una persona en un video

```text
subject_definitions:

<Video 1> is the source video being edited, preserving its camera movement, timing, shot structure, environment, object interactions, and original action.

<Subject 1> is the replacement woman from <Picture 1>, preserving her exact facial identity, hairstyle, body proportions, and overall physical appearance.

summary:

[video editing + reference generation] The target video is an edited version of <Video 1> in which the original visible person is replaced by <Subject 1>, while the original camera movement, environment, timing, and physical actions remain unchanged.

retention_analysis:

<Video 1> (source video structure): fully_preserved - preserve the original camera movement, timing, environment, shot composition, object positions, and physical actions.

<Subject 1> (replacement person): attribute_transfer - transfer the exact identity and appearance from <Picture 1> onto the person occupying the original performer's role.

detailed_description:

The target video preserves the visual style, framing, camera trajectory, timing, environment, and actions of <Video 1>.

[Shot 1] The person originally visible in <Video 1> is replaced by <Subject 1>. <Subject 1> occupies the same spatial position, performs the same physical motion, maintains the same interaction with surrounding objects, and follows the same camera-relative movement. Preserve <Subject 1>'s exact facial identity and appearance from <Picture 1> throughout the motion.

overall_soundscape:

Preserve the source video's corresponding physical ambience and synchronized action sounds.

non_diegetic_music:

Preserve the original music only if requested; otherwise N/A.
```

---

# 28. Ejemplo: First Frame + Last Frame

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 8.00-second mark of the target video.

integrated_multimodal_description:

[Shot 1] Cinematic, realistic. The shot begins in the exact composition established by <Picture 1>. <Subject 1> gradually turns toward camera-left while raising the glowing object from waist height toward chest height. The camera performs a slow push-in with small amplitude. As the object rises, its light becomes progressively stronger and changes the illumination on the subject's face and clothing. During the final two seconds, the subject adjusts posture, hand position, facial angle, and spacing until the composition converges naturally toward <Picture 2>. At 8.00 seconds, the subject, lighting, object position, framing, and camera angle match <Picture 2>.

overall_soundscape:

Soft fabric movement and a low electronic energy hum rise with the glowing object.

non_diegetic_music:

A restrained cinematic electronic pulse slowly increases in intensity and resolves at the final frame.
```

---

# 29. Ejemplo: infográfico sin personas

```text
subject_definitions:

<Subject 1> is the brand visual language from <Picture 1>, preserving its exact blue gradient palette, dark navy accents, rounded geometry, and magnifying-glass-inspired design language. The complete logo itself should appear only when explicitly requested.

summary:

[reference generation] Create a 15-second 9:16 premium motion-graphics infographic using <Subject 1> as the visual language. The video explains business discovery through icon-only visual storytelling without people, maps, small text, or numerical data.

retention_analysis:

<Subject 1> (appears throughout the video): weak_reference - preserve the brand color palette, geometric language, and visual styling without repeatedly reproducing the complete logo.

detailed_description:

The target video uses a clean premium SaaS motion-graphics style with a white background, electric-blue gradients, dark navy accents, soft shadows, subtle depth, and smooth physically coherent icon transitions.

VISIBLE TEXT — HIGHEST PRIORITY:
The ONLY visible text allowed is "PUBLICÁ", "MOSTRÁ", and "CONECTÁ". Each word appears alone, extremely large, bold, high-contrast, perfectly spelled, and stable. No other written characters appear anywhere. Absolutely no UI labels, microtext, numbers, percentages, prices, dates, random letters, pseudo-text, decorative lettering, or text-like placeholder lines. All interface cards are icon-only.

[Shot 1] Large isolated business icons float vertically with generous negative space. A search symbol moves between them. The word "PUBLICÁ" appears large and centered.

[Shot 2] At 00:05.000, the icons reorganize into clean catalog cards made only from product imagery and geometric blocks. "MOSTRÁ" appears centered.

[Shot 3] At 00:10.000, search, message, star, and growth icons connect through animated blue lines. "CONECTÁ" appears centered.

overall_soundscape:

Clean interface clicks, soft notification tones, and smooth transition whooshes.

non_diegetic_music:

Modern electronic corporate music at approximately 115 BPM with light percussion and restrained synth pulses.
```

---

# 30. Maestro + MiniMax H3 Multi-window

Maestro puede ejecutar MiniMax H3 en secuencias de múltiples ventanas.

En modo manual:

> **One non-empty line per window.**

Es decir:

- 2 ventanas = 2 líneas no vacías;
- 3 ventanas = 3 líneas no vacías;
- 4 ventanas = 4 líneas no vacías.

## 30.1 Regla fundamental

Cada ventana debe ser **autosuficiente**.

No asumas que la siguiente ventana interpretará correctamente una definición escrita únicamente en Window 1.

Repite en cada ventana:

- definición de Subjects;
- identidad;
- restricciones críticas;
- formato;
- relación con Pictures;
- prohibiciones;
- speaker IDs relevantes;
- estilo;
- continuidad.

## 30.2 Window 2 NO debe reiniciar la historia

Malo:

```text
Window 1:
Laura entra al restaurante y se sienta.

Window 2:
Laura entra al restaurante y se sienta. Luego habla.
```

Mejor:

```text
Window 1:
... End with <Subject 1> seated at the table, facing screen-right, with both hands resting beside the menu.

Window 2:
... Continue natively from the previous window: <Subject 1> is already seated at the table facing screen-right with both hands beside the menu. Do not replay her entrance or seating action.
```

## 30.3 Estado final y estado inicial

Window 1:

```text
End the window with <Subject 1> standing beside the blue door, right hand touching the handle, body facing screen-left.
```

Window 2:

```text
Continue natively from the exact previous state: <Subject 1> is already beside the blue door with her right hand touching the handle and body facing screen-left. Do not repeat the approach to the door.
```

## 30.4 Carry motion and sound

Cuando Maestro tiene habilitado `Carry motion and sound between windows`, favorece continuidad física con expresiones como:

```text
continue natively
without restarting
without replaying completed actions
preserve the exact final body state
continue the existing camera trajectory
the audio continues seamlessly
```

---

# 31. Template Multi-window manual

## Window 1

```text
<Subject 1> is [DEFINITION]. <Subject 2> is [DEFINITION]. <Picture 1> provides [ROLE]. Global rules: [CRITICAL RULES]. Create a [ASPECT RATIO] [STYLE] sequence. [ACTION 1]. [ACTION 2]. <Subject 1> (S1) says, <d>[Spanish] DIALOGUE.</d> End this window with [EXACT VISUAL STATE], preserving [POSITION / CAMERA / LIGHTING / ACTIVE MOTION] for native continuation.
```

## Window 2

```text
<Subject 1> is [SAME DEFINITION]. <Subject 2> is [SAME DEFINITION]. <Picture 1> provides [SAME ROLE]. Global rules: [REPEAT CRITICAL RULES]. Continue natively from the exact previous state: [COPY WINDOW 1 FINAL STATE]. Do not restart, restage, or replay completed actions. Continue [NEXT ACTION]. [NEXT ACTION]. End with [NEW FINAL STATE].
```

## Window 3

```text
<Subject 1> is [SAME DEFINITION]. <Subject 2> is [SAME DEFINITION]. Global rules: [REPEAT]. Continue natively from the exact previous state: [WINDOW 2 FINAL STATE]. Do not repeat previous actions. [FINAL STORY BEAT]. Progressively converge toward <Picture N> if a final composition reference exists.
```

---

# 32. Cómo evitar duplicidad de personajes

```text
Exactly two people are visible in the entire shot: <Subject 1> and <Subject 2>.
No additional people appear in foreground, background, reflections, screens, posters, photographs, or duplicated instances.
There is exactly one instance of <Subject 1> and exactly one instance of <Subject 2>.
Never clone, duplicate, mirror, or create alternate versions of either subject.
```

Si el espejo no es necesario:

```text
No mirrors or reflective surfaces show duplicate human figures.
```

---

# 33. Cómo evitar cambio de ropa

```text
<Subject 1> remains in the exact same outfit throughout every shot: [DETAILED CLOTHING].
No wardrobe change occurs.
Do not add jackets, hats, jewelry, accessories, uniforms, or alternate clothing not defined in <Subject 1>.
```

Inclúyelo también en retention:

```text
fully_preserved - preserve exact facial identity and the complete unchanged outfit across all shots.
```

---

# 34. Cómo evitar cambio de identidad

No basta con:

```text
same woman
```

Mejor:

```text
Preserve <Subject 1>'s exact facial identity throughout the entire video: same facial geometry, eye shape, nose shape, lips, jawline, skin tone, hairstyle, hairline, apparent age, and facial proportions. No face morphing or identity drift.
```

---

# 35. Cómo evitar inventar una pantalla de celular

Si Picture 2 es una captura exacta:

```text
<Subject 2> is the exact smartphone-screen content from <Picture 2>.
```

```text
The smartphone screen must display <Subject 2> exactly as supplied. Do not redesign, reinterpret, animate, replace, crop into a different interface, invent new pages, generate fake UI, or change any text.
```

Si la captura funciona como composición concreta:

```text
<Picture 2> is the exact screen-content/composition reference for the phone display.
```

---

# 36. Cómo escribir acciones físicas

Usa acciones observables.

Malo:

```text
She feels confident.
```

Mejor:

```text
She straightens her posture, lifts her chin slightly, relaxes her shoulders, and forms a small confident smile.
```

Malo:

```text
He becomes scared.
```

Mejor:

```text
His eyes widen, his shoulders tense, he takes one small step backward, and his breathing becomes audible.
```

---

# 37. Timing de diálogo

Orientación práctica para voz natural:

- 5 segundos: ~8–14 palabras;
- 10 segundos: ~20–30 palabras;
- 15 segundos: ~30–45 palabras.

No es una limitación oficial rígida. Depende del ritmo solicitado y de cuánta acción haya.

---

# 38. Orden robusto dentro de cada shot

1. encuadre;
2. quién aparece;
3. posición;
4. escenario;
5. luz;
6. acción inicial;
7. cámara;
8. diálogo;
9. reacción;
10. sonido sincronizado;
11. estado de cierre.

Ejemplo:

```text
[Shot 2] At 00:05.000, a medium close-up frames <Subject 1> on the left side of the table facing <Subject 2>. Warm window light falls across the right side of her face. <Subject 1> lifts the phone from the table and rotates its screen toward <Subject 2>. The camera performs a small push-in at slow speed. <Subject 1> (S1) smiles and says, <d>[Spanish] Mirá esto.</d> She stops speaking, closes her lips, and holds the phone steady. A soft phone-unlock sound is synchronized with the screen activation.
```

---

# 39. Subjects de estilo

Un Subject también puede representar estilo visual.

```text
<Subject 3> is the visual style from <Picture 3>, characterized by thick ink outlines, high-contrast cel shading, warm highlights, and dramatic anime lighting.
```

Si solo quieres inspiración general, `weak_reference` suele ser apropiado.

---

# 40. Logos

Un logo puede ser Subject.

```text
<Subject 1> is the exact DondeCR logo from <Picture 1>, preserving its original blue gradient, dark magnifying-glass symbol, geometry, proportions, spacing, and visual identity.
```

Para exactitud:

```text
Do not redesign, redraw, distort, recolor, mirror, crop, simplify, add text to, or replace <Subject 1>.
```

Si no quieres repetirlo:

```text
Use <Subject 1> only in the designated final brand reveal. Do not place the complete logo elsewhere in the sequence.
```

---

# 41. Estructura útil para anuncios

## 15 segundos

```text
0–3s    Hook
3–7s    Problem / Context
7–11s   Solution
11–13s  Benefit
13–15s  Brand / CTA
```

## 30 segundos

```text
0–4s    Hook
4–9s    Problem
9–15s   Product / Service
15–21s  Benefits
21–25s  Proof / Result
25–30s  Closing / CTA
```

No hace falta convertir cada bloque en un shot.

---

# 42. Infográficos

Para infografía:

- usa objetos grandes;
- pocos elementos simultáneos;
- jerarquía visual fuerte;
- iconos;
- transitions mediante morph;
- evita dashboards hiper detallados;
- evita texto pequeño;
- evita cientos de elementos.

Prompt visual útil:

```text
premium 2.5D motion graphics,
clean negative space,
large iconography,
smooth shape morphing,
controlled easing,
soft depth,
subtle shadows,
high readability,
large visual hierarchy
```

---

# 43. 9:16

```text
Create a 9:16 vertical composition optimized for mobile viewing.
Keep all critical subjects, approved text, and important graphical information inside the central vertical safe area.
Use large stacked compositions rather than wide horizontal layouts.
Arrange the information vertically from top to bottom, with one dominant visual idea at a time.
```

---

# 44. 16:9

```text
Create a 16:9 widescreen composition with balanced horizontal spacing.
Use lateral movement and horizontal visual flow while keeping the primary subject inside the central safe region.
```

---

# 45. Checklist antes de entregar un prompt

## Referencias

- [ ] Cada `<Subject N>` tiene un significado único.
- [ ] Cada `<Picture N>` se usa como frame/composición real cuando corresponde.
- [ ] Cada `<Video N>` describe una relación de video completo.
- [ ] Cada `<Audio N>` describe audio real.
- [ ] No cambia la numeración durante el prompt.
- [ ] No aparecen referencias nuevas fuera de `subject_definitions`.

## Shots

- [ ] `[Shot 1]` no tiene timestamp.
- [ ] Los siguientes timestamps aumentan.
- [ ] Los tiempos están dentro de la duración.
- [ ] Cada corte aporta información nueva.

## Diálogo

- [ ] Cada hablante tiene `(Sx)` estable.
- [ ] Solo voces que vocalizan reciben `(Sx)`.
- [ ] Las palabras habladas están dentro de `<d>`.
- [ ] La emoción y acción quedan fuera de `<d>`.
- [ ] El idioma de `<d>` es correcto.
- [ ] No se reescribe diálogo literal del usuario.

## Texto

- [ ] Solo aparece texto solicitado.
- [ ] El texto exacto se escribe entre comillas.
- [ ] Si hay riesgo de microtexto, está prohibido explícitamente.
- [ ] Los números están controlados.

## Cámara

- [ ] Los movimientos están escritos como oraciones naturales.
- [ ] No hay comandos de cámara contradictorios.
- [ ] La amplitud y velocidad solo se añaden cuando importan.

## Continuidad

- [ ] Ropa constante.
- [ ] Identidad constante.
- [ ] Props constantes.
- [ ] Posiciones coherentes.
- [ ] El siguiente shot respeta el estado anterior.
- [ ] Multi-window repite definiciones esenciales.
- [ ] Multi-window no reinicia acciones completadas.

## Audio

- [ ] Ambience y foley en `overall_soundscape`.
- [ ] Música no diegética en `non_diegetic_music`.
- [ ] Diálogo solo en `detailed_description`.
- [ ] No se repiten letras completas en las secciones de audio.

---

# 46. Errores comunes

## Error: usar Picture como personaje

Malo:

```text
<Picture 1> walks toward the camera.
```

Correcto:

```text
<Subject 1> is the woman from <Picture 1>.
<Subject 1> walks toward the camera.
```

## Error: cambiar speaker

Malo:

```text
Shot 1: Laura (S1)
Shot 3: Laura (S2)
```

Correcto: Laura conserva `(S1)` durante todo el video.

## Error: poner actuación dentro de `<d>`

Malo:

```text
<d>[Spanish, sad] No quiero ir.</d>
```

Correcto:

```text
<Subject 1> (S1) speaks softly with a trembling voice, <d>[Spanish] No quiero ir.</d>
```

## Error: timestamp en Shot 1

Malo:

```text
[Shot 1] At 00:00.000
```

Correcto:

```text
[Shot 1]
```

## Error: repetir el argumento en cada multi-window

Cada window necesita contexto, pero debe contener **solo su acción local**.

Window 2 no debe volver a ejecutar el contenido de Window 1.

## Error: `same character`

Muy débil. Define explícitamente los atributos a conservar.

## Error: UI compleja + texto perfecto

Si necesitas exactitud textual, genera paneles simples, iconos, bloques o usa screenshots suministrados como referencia.

---

# 47. Instrucción lista para pegar a otro LLM

La siguiente sección puede utilizarse como **system prompt / AGENTS.md / skill instruction** para un modelo que deba generar prompts MiniMax H3.

```text
You are an expert prompt engineer specialized in MiniMax H3 audiovisual generation.

Your job is to convert the user's request and supplied image, video, and audio references into a technically structured MiniMax H3 prompt.

GENERAL LANGUAGE RULE:
Write structural prompt descriptions in English unless the user explicitly requests otherwise. Preserve the requested original language for dialogue, lyrics, and visible on-screen text.

REFERENCE SEMANTICS:
- <Subject N> = reusable visible content abstracted from reference assets: people, characters, animals, objects, environments, clothing, interfaces, logos, styles, actions, poses, visual effects, etc.
- <Picture N> = a reference image used as a concrete first frame, keyframe, last frame, storyboard/composition anchor, or shot-planning reference.
- <Video N> = a whole-video relationship: source video for editing, continuation source, camera/cut/rhythm reference, or temporal structure reference.
- <Audio N> = an audio signal that is directly copied or referenced for voice, music, rhythm, lyrics, ambience, sound effects, or continuity.

REFERENCE CONSISTENCY:
Once a label is defined, never change its meaning.
Never reuse a Subject, Picture, Video, Audio, or Speaker number for different content.
If an image only supplies a character/object/style, cite <Picture N> inside the relevant <Subject N> definition instead of treating the picture as the moving subject.
If a visible person/object from a source video is reused, define it as <Subject N>; <Video N> remains the whole-video relationship.

FULL-REFERENCE OUTPUT:
When Full-Reference / Omni mode is requested, always use these six sections in exactly this order:

subject_definitions:
summary:
retention_analysis:
detailed_description:
overall_soundscape:
non_diegetic_music:

SUMMARY TASK PREFIXES:
Use only applicable task types:
[keyframe completion]
[reference generation]
[video editing]
[video continuation]
[audio reuse]
[audio reference]

Combine applicable types using " + ".

RETENTION MARKERS:
For Subject/Picture/Video:
fully_preserved
partially_preserved
attribute_transfer
weak_reference

For Audio:
fully_copy
partially_copy
reference
weak_reference

SHOTS:
- [Shot 1] never receives a timestamp.
- Later shots use [Shot N] At MM:SS.mmm.
- Times indicate cuts and must increase monotonically.
- Do not create unnecessary shots when camera movement can describe the change.

CAMERA:
Write camera motion as natural English action.
Supported useful vocabulary includes:
Zoom In / Zoom Out
Push In / Pull Out
Pan Left / Pan Right
Truck Left / Truck Right
Tilt Up / Tilt Down
Pedestal Up / Pedestal Down
Arc Shot
Tracking Shot
Static Shot
POV
Roll Clockwise / Roll Counterclockwise
Shake Slightly / Shake Strongly

Use "with small amplitude" or "with large amplitude" when meaningful.
Use "at slow speed" or "at fast speed" when meaningful.
Never append disconnected camera keyword lists.

SPEAKERS:
Assign stable speaker IDs in the order of actual target-video vocal events:
(S1), (S2), (S3), etc.
A non-speaking character does not need a speaker ID.
If already-numbered speakers speak together, use (S1,S2).

DIALOGUE:
All actual spoken dialogue or lyrics must be written:
<d>[Language] EXACT WORDS</d>

Example:
<Subject 1> (S1) smiles and says, <d>[Spanish] Hola, ¿cómo estás?</d>

Keep acting instructions outside <d>.
Never rewrite, translate, or paraphrase user-provided dialogue unless explicitly asked.

VOICEOVER:
Use the explicit wording "says in an off-screen voiceover".
If a corresponding visible character is on screen, state that the character's lips remain completely closed during the voiceover.

SCENE-CROSSING DIALOGUE:
Use <scenetrans> only when the same spoken line/audio deliberately continues across a shot transition, and explicitly state that audio continues seamlessly across the cut.

TRUNCATED DIALOGUE:
Use <cutoff> only when speech is intentionally interrupted or truncated by the end/edit.

VISIBLE TEXT:
All visible signs, titles, labels, or captions should be quoted exactly.
Never translate visible text unless the user requests translation.
If text accuracy matters, explicitly constrain allowed text.
If UI is generated, proactively avoid microtext and fake labels.

ANTI-GIBBERISH RULE:
When user requests clean graphics or precise text, add:
"Absolutely no small text, microtext, fake interface labels, gibberish, pseudo-text, random letters, decorative writing, or unrequested numbers. Any interface-like elements must be icon-only and made from large symbols, solid geometric blocks, thumbnails, stars, circles, and simple shapes."

AUDIO:
overall_soundscape = ambience, foley, impacts, environmental and physical sounds.
non_diegetic_music = music heard only by the audience.
Do not repeat complete dialogue/lyrics in these sections.

TIMELINE WRITING:
Describe the video strictly in playback order.
For each shot establish:
1. composition;
2. referenced subject appearance;
3. spatial position;
4. environment;
5. lighting;
6. observable action;
7. camera motion;
8. dialogue;
9. reaction/state change;
10. synchronized sounds;
11. closing state when continuity matters.

PHYSICAL ACTION:
Prefer observable physical descriptions instead of abstract emotions.
Example:
Instead of "she becomes nervous", write "her shoulders tense, her eyes widen slightly, and she takes one small step backward."

IDENTITY:
When identity consistency matters, explicitly preserve facial geometry, eye shape, nose, lips, jawline, skin tone, hairstyle, hairline, apparent age, body proportions, and outfit.
Do not permit identity drift or wardrobe changes unless requested.

MULTI-WINDOW / MAESTRO:
If using Maestro manual multi-window:
- produce exactly one non-empty prompt line per window;
- make every window self-contained;
- repeat all critical Subject/Picture/Video/Audio definitions and hard constraints in every relevant window;
- repeat speaker identity when needed;
- keep each window's story actions local;
- state the exact closing visual state at the end of each window;
- begin the next with the exact inherited opening state;
- explicitly say "continue natively", "without restarting", and "do not replay completed actions" when continuity is required;
- never make Window 2 repeat Window 1's completed action;
- when preparing a final transition into another supplied clip, dedicate the end of the last generated window to converging toward the supplied composition instead of starting a new event.

FIRST/LAST FRAME:
For I2VA, Picture 1 is the actual frame at 0.00 seconds and the action develops forward.
For FL2VA, describe the continuous physical path from the first image to the final image; do not merely describe both images.
For L2VA, infer a plausible earlier state and progressively converge toward the supplied last frame.

PROMPT QUALITY:
Be explicit, chronological, physically observable, and internally consistent.
Do not reduce detailed_description to a plot summary.
Do not overpack a short duration with too many independent actions, cuts, dialogue lines, or visual transformations.
Prioritize identity continuity, action continuity, timing, readable composition, and exact requested dialogue over decorative prose.

Before returning the prompt, silently verify:
- reference numbering;
- speaker numbering;
- shot timing;
- dialogue tags;
- language;
- visible text;
- no contradictory camera directions;
- no duplicated subjects;
- no accidental wardrobe changes;
- no story resets between windows;
- final frame/continuation requirements.
```

---

# 48. Template ultra-rápido para otro modelo

```text
subject_definitions:
<Subject 1> is ...
<Subject 2> is ...
<Picture 1> is ...
<Video 1> is ...
<Audio 1> is ...

summary:
[reference generation] ...

retention_analysis:
<Subject 1> (...): fully_preserved - ...
<Subject 2> (...): fully_preserved - ...
<Picture 1> (...): fully_preserved - ...
<Video 1> (...): weak_reference - ...
<Audio 1>: reference - ...

detailed_description:
The target video uses ...

[Shot 1] ...
<Subject 1> (S1) says, <d>[Spanish] ...</d>

[Shot 2] At 00:XX.XXX, ...
<Subject 2> (S2) says, <d>[Spanish] ...</d>

overall_soundscape:
...

non_diegetic_music:
...
```

---

# 49. Jerarquía recomendada al resolver contradicciones

Si las instrucciones entran en conflicto, un generador de prompts debería priorizar:

1. **restricciones explícitas del usuario**;
2. identidad de referencias;
3. diálogo exacto;
4. first/last/keyframes obligatorios;
5. continuidad física;
6. duración;
7. composición y cámara;
8. texto visible;
9. sonido;
10. estilo decorativo.

Si una petición no cabe razonablemente en la duración, no finjas que sí: simplifica acciones secundarias o señala la incompatibilidad.

---

# 50. Fuentes oficiales y referencias

Documentación oficial MiniMax H3:

- Video Prompt Writing Guide, T2VA / I2VA / FL2VA / L2VA:  
  https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md

- Full-Reference Mode Rewrite Output Format Guide:  
  https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md

- Repositorio oficial:  
  https://github.com/MiniMax-AI/MiniMax-H3

Para Multi-window con Maestro:

- https://github.com/Blizaine/Maestro

---

# 51. Principio final

El mejor prompt H3 no es el que contiene más adjetivos.

Es el que define con precisión:

- **qué debe conservarse**;
- **qué puede cambiar**;
- **quién hace qué**;
- **cuándo ocurre**;
- **qué cámara lo muestra**;
- **qué se oye**;
- **qué referencia controla cada parte**;
- **cómo termina cada estado para que el siguiente pueda continuar correctamente**.

Especialmente en Full-Reference y Multi-window, piensa en el prompt como una **especificación audiovisual cronológica**, no como una descripción artística genérica.
