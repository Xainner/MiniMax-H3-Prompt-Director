# Multimedia Desktop App — Technical Guidelines for LLM

## Purpose

This document defines the preferred technology stack, libraries, architectural guidelines, and implementation rules for a **desktop multimedia application built with Tauri 2 + Rust**.

The application may work with:

- Video
- Images
- Audio
- Local media libraries
- Metadata
- Thumbnails
- Playlists / collections
- Search and filtering
- Media previews
- Large local libraries

The LLM must use the libraries described in this document **when they are appropriate for the requested feature**.

Do **not** install or use every library by default.

Dependencies must be introduced only when the feature being implemented actually benefits from them.

---

# 1. Core Stack

The preferred base stack is:

- **Tauri 2**
- **Rust**
- **React**
- **TypeScript**
- **Vite**

Unless the existing project already uses a different frontend framework, new UI code should prefer React + TypeScript.

---

# 2. UI Stack

## Tailwind CSS 4

Use **Tailwind CSS 4** for application styling.

Preferred for:

- Layout
- Spacing
- Typography
- Responsive behavior
- Colors
- States
- Dark mode
- Desktop-style interface composition

Avoid large amounts of duplicated handwritten CSS when Tailwind utilities can express the same layout clearly.

---

## shadcn/ui

Use **shadcn/ui** as the primary UI component system.

Preferred for:

- Buttons
- Inputs
- Dialogs
- Dropdown menus
- Context menus
- Tooltips
- Tabs
- Sheets
- Popovers
- Select controls
- Sliders
- Command interfaces
- Form controls
- Cards
- Navigation elements

Components should be customized to match the application's design language.

Do not treat shadcn/ui as a fixed visual theme.

---

## Base UI / Radix UI

Use **Base UI** or **Radix UI primitives** when lower-level accessible UI primitives are required.

Prefer existing shadcn/ui components first.

Use primitives directly only when:

- The required component does not exist in the current shadcn setup.
- A highly customized interaction is needed.
- Accessibility behavior would otherwise need to be recreated manually.

---

## Lucide React

Use **Lucide React** for icons.

Avoid mixing multiple icon libraries unless a required icon is genuinely unavailable.

Maintain consistent:

- Stroke width
- Icon size
- Alignment
- Visual weight

---

## Motion

Use **Motion** (`motion/react`) for UI animation.

Appropriate uses include:

- View transitions
- Dialog animations
- Sidebar animations
- Hover interactions
- Expand/collapse transitions
- Media overlay controls
- Subtle layout transitions
- Drag feedback

Animations should normally be subtle and fast.

Prefer approximately:

- 100–250 ms UI transitions
- Spring motion only where it improves interaction

Avoid excessive animations that make a desktop application feel slow.

---

# 3. State Management

## Zustand

Use **Zustand** for shared application state when React local state is no longer sufficient.

Good candidates:

- Current media item
- Player state
- Active playlist
- Viewer state
- Library filters
- Current directory
- User preferences
- UI panel state
- Selected media
- Playback queue

Do not put all application state into a single global store.

Keep feature-specific state isolated when possible.

---

# 4. Forms

## React Hook Form

Use **React Hook Form** for complex forms.

Examples:

- Settings
- Media metadata editing
- Library configuration
- Folder configuration
- Export settings
- Player preferences

For very small forms, ordinary React state is acceptable.

---

# 5. Notifications

## Sonner

Use **Sonner** for toast notifications.

Examples:

- Media successfully imported
- Folder scan completed
- Export finished
- Failed to load media
- Metadata saved
- File moved
- Favorite added

Do not use toast notifications for information that belongs permanently in the UI.

---

# 6. Command Palette

## cmdk

Use **cmdk** when implementing a command palette.

Recommended shortcut:

`Ctrl + K`

Possible commands:

- Search library
- Open file
- Open folder
- Play selected item
- Add to favorites
- Toggle sidebar
- Open settings
- Jump to videos
- Jump to images
- Jump to audio

---

# 7. Tables and Structured Data

## TanStack Table

Use **TanStack Table** when media needs to be shown in a detailed table view.

Examples:

- Filename
- Duration
- Codec
- Resolution
- Bitrate
- Size
- Date
- Tags
- Rating
- Play count
- Last played

Do not use it for simple lists where standard React rendering is sufficient.

---

# 8. Virtualization

## TanStack Virtual

Use **TanStack Virtual** when rendering large collections.

This is especially important for:

- Large image galleries
- Thousands of videos
- Audio libraries
- Search results
- Large playlists
- Long metadata tables

Do not render tens of thousands of media cards into the DOM simultaneously.

Virtualize large lists and grids.

---

# 9. Resizable Desktop Panels

## react-resizable-panels

Use **react-resizable-panels** when the user should be able to resize interface regions.

Examples:

- Library sidebar
- Media viewer
- Metadata inspector
- Playlist panel
- File browser
- Timeline panel

Persist panel sizes when useful.

---

# 10. Drag and Drop

## dnd-kit

Use **dnd-kit** for advanced drag-and-drop interactions.

Examples:

- Reordering playlists
- Reordering queue items
- Moving media between collections
- Sorting dashboard widgets
- Dragging selected items into categories

Native file drag-and-drop may continue using Tauri/browser APIs where appropriate.

---

# 11. Video Playback

## mpv / libmpv

For serious local video playback, prefer **mpv / libmpv** over relying exclusively on the HTML `<video>` element.

Use mpv when the app needs:

- Wide codec support
- MKV support
- Multiple audio tracks
- Multiple subtitle tracks
- Advanced seeking
- Playback speed
- Video filters
- HDR-related playback behavior
- Screenshots
- High-quality desktop playback
- Reliable local media support

The visual player controls should generally be implemented by the application UI.

mpv should act primarily as the playback engine.

---

## tauri-plugin-libmpv

Use **tauri-plugin-libmpv** when it is suitable for integrating libmpv into the Tauri application.

Before depending heavily on this plugin:

- Check compatibility with the current Tauri version.
- Keep the application architecture loosely coupled to the plugin.
- Avoid making application business logic dependent on plugin-specific APIs.

If necessary, implement or wrap the libmpv integration in Rust.

---

# 12. FFmpeg

Use **FFmpeg** for media processing.

Typical uses:

- Generate video thumbnails
- Generate preview frames
- Convert media
- Extract audio
- Generate waveform data
- Create preview clips
- Resize media
- Export clips
- Capture frames
- Transcode unsupported formats

FFmpeg should normally run from the Rust/backend layer or as a Tauri sidecar.

Avoid running expensive FFmpeg jobs in the React UI thread.

---

# 13. ffprobe

Use **ffprobe** to inspect multimedia files.

Store useful metadata such as:

- Duration
- Width
- Height
- FPS
- Video codec
- Audio codec
- Bitrate
- Number of streams
- Subtitle streams
- Audio channels
- Sample rate
- Container
- HDR metadata when available

Metadata that is expensive to obtain should be cached.

---

# 14. Audio

## WaveSurfer.js

Use **WaveSurfer.js** when audio needs a visual waveform or interactive timeline.

Use it for:

- Audio playback UI
- Waveforms
- Seeking
- Audio previews
- Visual timelines
- Selection ranges

---

## WaveSurfer Regions

Use the **Regions** plugin when the user needs:

- Selection ranges
- Loop regions
- Marked sections
- Editable start/end ranges

---

## WaveSurfer Timeline

Use the **Timeline** plugin when time markers improve the audio interface.

---

## WaveSurfer Spectrogram

Use the **Spectrogram** plugin only when spectral visualization is useful.

Do not enable it by default for normal music playback.

---

# 15. Images

## Yet Another React Lightbox

Use **Yet Another React Lightbox** for a polished image viewing / gallery experience.

Appropriate for:

- Fullscreen image viewing
- Previous / next navigation
- Galleries
- Slides
- Image overlays

---

## YARL Zoom Plugin

Use the **Zoom** plugin for:

- Mouse wheel zoom
- Pinch zoom
- Double-click zoom
- Panning

---

## YARL Fullscreen Plugin

Use the **Fullscreen** plugin when immersive viewing is required.

---

## YARL Thumbnails Plugin

Use the **Thumbnails** plugin for image strips or gallery navigation.

---

## react-zoom-pan-pinch

Use **react-zoom-pan-pinch** when a custom image viewer requires direct control over:

- Zoom
- Pan
- Fit
- Reset
- Transform state

Do not use both this library and the YARL zoom plugin for the same viewer unless there is a clear architectural reason.

---

# 16. Image Metadata

## ExifReader

Use **ExifReader** to read image metadata when useful.

Examples:

- Camera
- Lens
- ISO
- Aperture
- Shutter speed
- Focal length
- Capture date
- Orientation
- GPS, if intentionally supported
- EXIF
- IPTC
- XMP

Do not expose sensitive metadata such as GPS coordinates unintentionally.

---

# 17. Image Editing and Annotation

## Konva / react-konva

Use **Konva** with **react-konva** when implementing canvas-based image editing.

Appropriate for:

- Crop overlays
- Text
- Drawing
- Shapes
- Arrows
- Stickers
- Annotation
- Resize handles
- Selections
- Interactive objects

Do not introduce Konva for a simple image viewer.

---

# 18. Extremely Large Images

## OpenSeadragon

Use **OpenSeadragon** when images are extremely large and deep zoom / tiled rendering is beneficial.

Examples:

- Gigapixel imagery
- Scanned maps
- Very large artwork
- Scientific imagery

Do not use OpenSeadragon for ordinary JPG/PNG viewing.

---

# 19. Rust Image Processing

## image-rs

Use **image-rs** for backend image processing where appropriate.

Examples:

- Read image dimensions
- Resize images
- Generate thumbnails
- Convert formats
- Create cached previews
- Basic transformations

Prefer backend processing for large batch operations.

---

## image-webp

Use **image-webp** when dedicated WebP decoding/encoding functionality is needed.

Do not add it if existing image-rs functionality already satisfies the feature.

---

# 20. Database

## SQLite

Use **SQLite** as the preferred local database for the media library.

Good data to persist:

- Media path
- Filename
- Media type
- MIME type
- File size
- Duration
- Dimensions
- Codec
- Bitrate
- Thumbnail path
- Preview path
- Date added
- Modified date
- Last played
- Playback progress
- Favorites
- Ratings
- Tags
- Collections
- Playlists
- Scan state

The filesystem remains the source of truth for actual media files.

SQLite stores the application's indexed metadata.

---

## tauri-plugin-sql

Use **tauri-plugin-sql** when it provides a suitable SQLite integration.

For complex database operations, large scans, indexing, or transactions, Rust-side database access may be preferable.

Do not send huge amounts of database work through the frontend unnecessarily.

---

# 21. Tauri Plugins

## tauri-plugin-fs

Use for safe filesystem access where appropriate.

---

## tauri-plugin-dialog

Use for:

- Open file
- Open folder
- Save file
- Folder selection

Prefer native dialogs for desktop workflows.

---

## tauri-plugin-shell

Use when launching allowed external processes or sidecars such as:

- FFmpeg
- ffprobe
- mpv

Commands must be explicitly scoped and validated.

Never execute arbitrary user-controlled shell commands.

---

## tauri-plugin-opener

Use when the application needs to open:

- A media file with the operating system
- A folder
- An external URL

---

## tauri-plugin-window-state

Use to preserve desktop window state.

Persist when appropriate:

- Window size
- Position
- Maximized state

---

# 22. Recommended Architecture

Prefer the following separation:

```text
Tauri Application
│
├── Rust Backend
│   ├── Filesystem
│   ├── Media scanner
│   ├── SQLite
│   ├── Metadata extraction
│   ├── Thumbnail generation
│   ├── Cache management
│   ├── FFmpeg
│   ├── ffprobe
│   └── mpv / libmpv integration
│
└── React Frontend
    ├── shadcn/ui
    ├── Tailwind CSS
    ├── Lucide
    ├── Motion
    ├── Zustand
    │
    ├── Library UI
    │   ├── TanStack Virtual
    │   └── TanStack Table
    │
    ├── Video
    │   └── mpv controller UI
    │
    ├── Images
    │   ├── Yet Another React Lightbox
    │   ├── react-zoom-pan-pinch
    │   ├── ExifReader
    │   └── react-konva when editing is required
    │
    └── Audio
        └── WaveSurfer.js
```

---

# 23. Media Cache Strategy

Do not load full-resolution source files unnecessarily.

For images, prefer:

```text
Original image
   │
   ├── Thumbnail
   │     ~256–512 px
   │
   ├── Preview
   │     ~1280–1920 px
   │
   └── Original
         loaded only when needed
```

For video, cache:

- Poster thumbnails
- Timeline thumbnails
- Metadata
- Optional preview clips

The cache should have a deterministic relationship with the original file.

Prefer hashing or another collision-safe cache key.

---

# 24. Large Library Performance

The application may contain tens of thousands of media files.

The LLM must therefore avoid architectures that assume the entire library fits comfortably in the DOM or memory.

Use:

- Virtualized lists
- Pagination where useful
- Database indexes
- Batched Rust operations
- Background worker threads
- Lazy image loading
- Thumbnail caches
- Incremental filesystem scanning
- Debounced search
- Cancellation for obsolete requests

Never freeze the UI while scanning or processing media.

---

# 25. Threading and Heavy Work

Heavy operations should happen outside the frontend UI thread.

Examples:

- Directory scanning
- ffprobe
- FFmpeg
- Thumbnail generation
- Hashing
- Metadata extraction
- Database indexing
- Large image decoding

Prefer Rust tasks / worker threads / async backend operations as appropriate.

React should primarily handle presentation and interaction.

---

# 26. Error Handling

Media files may be:

- Missing
- Deleted
- Moved
- Corrupt
- Unsupported
- Partially downloaded
- Locked by another application

The app must fail gracefully.

Prefer:

- Placeholder thumbnails
- Clear error messages
- Retry options
- Re-scan options
- Missing-file indicators

Never crash the entire library because one media file is invalid.

---

# 27. Desktop UX

The UI should feel like a native desktop application rather than a website.

Prefer:

- Custom title bar where appropriate
- Keyboard shortcuts
- Context menus
- Hover states
- Tooltips
- Resizable panels
- Drag and drop
- Compact controls
- Persistent layout
- Right-click interactions
- Fullscreen viewers
- Focus management
- Command palette

---

# 28. Keyboard Shortcuts

Where appropriate, support desktop keyboard shortcuts.

Examples:

```text
Space        Play / Pause
Left         Previous / Seek backward
Right        Next / Seek forward
Ctrl + K     Command palette / Search
Ctrl + O     Open file
Ctrl + Shift + O
             Open folder
F            Fullscreen
Esc          Close viewer / Exit fullscreen
+            Zoom in
-            Zoom out
0            Reset zoom
Delete       Remove from library / collection
```

Shortcuts must not conflict with text input controls.

---

# 29. Dependency Rules for the LLM

The LLM MUST follow these rules.

## Rule 1 — Do not install everything

Only add a dependency when the feature requires it.

---

## Rule 2 — Reuse existing dependencies

Before adding a library, inspect the project.

If an existing dependency already solves the problem cleanly, reuse it.

---

## Rule 3 — Avoid overlapping libraries

Do not introduce two libraries that solve the exact same problem without a good reason.

Example:

Do not use both:

- YARL Zoom
- react-zoom-pan-pinch

for the exact same image viewer unless the design genuinely requires both.

---

## Rule 4 — Keep frontend and backend responsibilities separate

Use React for:

- Interface
- Interaction
- Display state
- Lightweight transformations

Use Rust for:

- Filesystem
- Database
- Scanning
- Heavy processing
- Native integrations
- FFmpeg
- ffprobe
- mpv control where appropriate

---

## Rule 5 — Prefer maintainable abstractions

External tools such as FFmpeg and mpv should be wrapped behind internal application services.

Example:

```text
MediaService
VideoPlaybackService
ThumbnailService
MetadataService
LibraryService
```

Components should not directly depend on raw shell commands.

---

## Rule 6 — Preserve existing architecture

When modifying an existing project:

1. Inspect the project structure.
2. Inspect existing dependencies.
3. Follow established patterns.
4. Avoid unnecessary rewrites.
5. Introduce new dependencies incrementally.

---

# 30. Feature-to-Library Reference

Use this reference when deciding which dependency is appropriate.

| Feature | Preferred Library |
|---|---|
| Desktop shell | Tauri 2 |
| Backend/native logic | Rust |
| Frontend | React + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS 4 |
| UI components | shadcn/ui |
| Accessible primitives | Base UI / Radix UI |
| Icons | Lucide React |
| Animations | Motion |
| Global state | Zustand |
| Forms | React Hook Form |
| Toast notifications | Sonner |
| Command palette | cmdk |
| Tables | TanStack Table |
| Large list/grid rendering | TanStack Virtual |
| Resizable panels | react-resizable-panels |
| Drag & drop | dnd-kit |
| Video playback | mpv / libmpv |
| Tauri mpv integration | tauri-plugin-libmpv |
| Media processing | FFmpeg |
| Media metadata | ffprobe |
| Audio waveform/player | WaveSurfer.js |
| Audio regions | WaveSurfer Regions |
| Audio timeline | WaveSurfer Timeline |
| Spectrogram | WaveSurfer Spectrogram |
| Image gallery/viewer | Yet Another React Lightbox |
| Image zoom | YARL Zoom |
| Fullscreen image viewer | YARL Fullscreen |
| Image thumbnails | YARL Thumbnails |
| Custom zoom/pan | react-zoom-pan-pinch |
| EXIF metadata | ExifReader |
| Image editing/canvas | Konva + react-konva |
| Huge image/deep zoom | OpenSeadragon |
| Rust image processing | image-rs |
| WebP-specific Rust support | image-webp |
| Local database | SQLite |
| Tauri SQL integration | tauri-plugin-sql |
| Filesystem | tauri-plugin-fs |
| Native dialogs | tauri-plugin-dialog |
| Sidecars/processes | tauri-plugin-shell |
| Open external files/URLs | tauri-plugin-opener |
| Window persistence | tauri-plugin-window-state |

---

# 31. Final Implementation Principle

The goal is not to maximize the number of libraries used.

The goal is to build a:

- Fast
- Maintainable
- Visually polished
- Native-feeling
- Reliable
- Scalable

desktop multimedia application.

Use the libraries in this document **as preferred tools when their capabilities match the requested feature**.

Always choose the simplest architecture that fully satisfies the requirement without sacrificing maintainability or media performance.
