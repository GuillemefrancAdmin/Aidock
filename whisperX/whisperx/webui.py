import os
import shutil
import subprocess
import sys
import tempfile
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import gradio as gr


MODEL_CHOICES = [
    "tiny",
    "base",
    "small",
    "medium",
    "large-v1",
    "large-v2",
    "large-v3",
    "large-v3-turbo",
    "distil-large-v2",
    "distil-large-v3",
]
OUTPUT_FORMATS = ["all", "srt", "vtt", "txt", "tsv", "json"]
UI_CSS = """
:root { --ink: #17202a; --muted: #68727d; --orange: #e85d04; --orange-dark: #bd4300; --line: #e4e7eb; --paper: #fbfaf8; }
body { background: var(--paper); }
.gradio-container { max-width: none !important; width: 100% !important; padding: 0.35rem 0.7rem 0.5rem !important; }
.hero { width: 100%; box-sizing: border-box; position: relative; overflow: hidden; padding: 1.5rem 1.75rem; border: 1px solid #ead8c7; border-radius: 16px; background: linear-gradient(120deg, #fff1e5 0%, #fffaf5 58%, #eef2f3 100%); box-shadow: 0 8px 22px rgba(44, 31, 20, 0.06); }
.hero::after { content: ""; position: absolute; width: 220px; height: 220px; right: -60px; top: -85px; border: 1px solid rgba(232, 93, 4, 0.22); border-radius: 50%; box-shadow: 0 0 0 24px rgba(232, 93, 4, 0.05), 0 0 0 48px rgba(232, 93, 4, 0.035); pointer-events: none; }
.hero-kicker { position: relative; z-index: 1; display: block; margin: 0 0 0.55rem; color: var(--orange-dark); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
.hero h1 { position: relative; z-index: 1; max-width: 30ch; margin: 0 0 0.5rem; color: var(--ink); font-size: clamp(1.75rem, 3.2vw, 2.5rem); line-height: 1.08; letter-spacing: -0.03em; }
.hero-subtitle { position: relative; z-index: 1; max-width: 54ch; margin: 0; color: #59636d; font-size: 0.95rem; line-height: 1.5; }
.workspace-row { align-items: stretch; gap: 0.55rem; margin-top: 0.4rem; }
.workspace-panel { min-height: 100%; padding: 0.55rem; border: 1px solid var(--line); border-radius: 10px; background: rgba(255, 255, 255, 0.78); box-shadow: 0 5px 14px rgba(23, 32, 42, 0.035); }
.section-label { margin: 0 0 0.35rem; color: var(--orange-dark); font-size: 0.62rem; font-weight: 800; letter-spacing: 0.13em; text-transform: uppercase; }
.section-label { cursor: pointer; }
.audio-drop { min-height: 82px; }
.audio-drop .wrap { min-height: 68px; border: 1px dashed #d8a980; border-radius: 8px; background: #fffaf6; }
.run-button { min-height: 2.2rem; margin-top: 0.3rem; border: 0 !important; border-radius: 7px !important; background: var(--orange) !important; color: white !important; font-weight: 800 !important; letter-spacing: 0.01em; box-shadow: 0 5px 12px rgba(232, 93, 4, 0.16); transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease; }
.run-button:hover { background: var(--orange-dark) !important; transform: translateY(-1px); box-shadow: 0 11px 22px rgba(232, 93, 4, 0.26); }
.status-box input { color: var(--orange-dark) !important; font-weight: 700; }
.results-status-badge { position: sticky; top: 0; z-index: 5; margin: 0 0 0.4rem; }
.results-status-badge input { background: #fff1e5 !important; border: 1px solid #ead8c7 !important; border-radius: 8px !important; padding: 0.35rem 0.6rem !important; font-size: 0.85rem !important; text-align: center; }
.results-panel { margin-top: 0.4rem; padding: 0.55rem; border: 1px solid var(--line); border-radius: 10px; background: #ffffff; box-shadow: 0 5px 14px rgba(23, 32, 42, 0.035); }
.results-panel textarea { min-height: 110px !important; line-height: 1.35 !important; }
.transcript-preview textarea { max-height: 180px !important; overflow-y: auto !important; resize: vertical; }
.log-view textarea { max-height: 180px !important; overflow-y: auto !important; }
.download-panel { margin-top: 0.5rem; padding-top: 0.55rem; border-top: 1px solid var(--line); }
.file-list { gap: 0.4rem !important; }
.file-row { align-items: center; gap: 0.5rem; padding: 0.5rem 0.7rem; border: 1px solid var(--line); border-radius: 8px; background: #fffaf6; }
.file-row-name { flex: 1; font-size: 0.85rem; color: var(--ink); word-break: break-all; }
.file-row-icon { min-width: 2.1rem !important; max-width: 2.1rem !important; flex: none !important; padding: 0 !important; font-size: 1rem !important; }
.file-list-empty { padding: 0.6rem 0.2rem; color: var(--muted); font-size: 0.85rem; }
footer { display: none !important; }
"""


def _prepare_ffmpeg_path() -> str:
    """Return a PATH that contains an executable named ffmpeg."""
    current_ffmpeg = shutil.which("ffmpeg")
    if current_ffmpeg and subprocess.run(
        [current_ffmpeg, "-version"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0:
        return os.environ.get("PATH", "")

    try:
        import imageio_ffmpeg

        source = Path(imageio_ffmpeg.get_ffmpeg_exe())
    except (ImportError, RuntimeError) as error:
        raise RuntimeError(
            "FFmpeg is required. Install it on PATH or install the web UI extra."
        ) from error

    shim_dir = Path(tempfile.gettempdir()) / "whisperx-ffmpeg"
    shim_dir.mkdir(parents=True, exist_ok=True)
    shim_path = shim_dir / "ffmpeg.exe"
    if not shim_path.exists():
        shutil.copy2(source, shim_path)
    ffprobe_path = shim_dir / "ffprobe.exe"
    if not ffprobe_path.exists():
        shutil.copy2(source, ffprobe_path)
    return f"{shim_dir}{os.pathsep}{os.environ.get('PATH', '')}"


def _hf_token_path() -> Path:
    """Location of the Hugging Face token cache, shared with huggingface_hub."""
    try:
        from huggingface_hub import constants

        return Path(constants.HF_TOKEN_PATH)
    except (ImportError, AttributeError):
        hf_home = os.environ.get("HF_HOME") or Path.home() / ".cache" / "huggingface"
        return Path(hf_home) / "token"


def _load_hf_token() -> str:
    """Return the token from the environment, falling back to the saved one."""
    token = os.environ.get("HF_TOKEN", "").strip()
    if token:
        return token
    try:
        return _hf_token_path().read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _save_hf_token(token: str) -> None:
    """Persist the token so later runs pick it up without retyping it."""
    token = token.strip()
    if not token or token == _load_hf_token():
        return
    path = _hf_token_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(token, encoding="utf-8")
        os.chmod(path, 0o600)
    except OSError:
        pass  # a read-only cache is not worth failing the transcription over


def _create_audio_preview(audio_file: str | None) -> tuple[str | None, Any]:
    if not audio_file:
        return None, gr.update(interactive=False)

    input_path = Path(audio_file)
    preview_path = Path(tempfile.gettempdir()) / f"whisperx-preview-{input_path.stem}.wav"
    environment = os.environ.copy()
    environment["PATH"] = _prepare_ffmpeg_path()
    ffmpeg = shutil.which("ffmpeg", path=environment["PATH"])
    result = subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(input_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-acodec",
            "pcm_s16le",
            str(preview_path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=environment,
    )
    if result.returncode != 0:
        raise gr.Error(f"Could not create audio preview: {result.stderr[-1000:]}")
    return str(preview_path), gr.update(interactive=True)


def _clear_transcription_outputs() -> tuple[str, str, list[str], str, float]:
    return "Preparing", "", [], "", time.monotonic()


def _load_file_preview(path: str | None) -> str:
    if not path:
        raise gr.Error("Choose a file to view first.")
    file_path = Path(path)
    if not file_path.is_file():
        raise gr.Error("That file is no longer available.")
    try:
        return file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError as error:
        raise gr.Error("This file isn't text and can't be viewed here.") from error


def _update_elapsed_status(started_at: float | None, status: str) -> str:
    if not started_at or not status.startswith("Processing"):
        return status
    return f"Processing · {time.monotonic() - started_at:.1f}s"


def _parse_speaker_count(raw: str, label: str) -> int | None:
    """Parse an optional speaker-count field; blank means let WhisperX auto-detect it."""
    text = (raw or "").strip()
    if not text:
        return None
    try:
        value = int(text)
    except ValueError as error:
        raise gr.Error(f"{label} must be a whole number, or left blank to auto-detect.") from error
    if value < 1:
        raise gr.Error(f"{label} must be at least 1, or left blank to auto-detect.")
    return value


def transcribe_file(
    audio_file: str,
    model: str,
    device: str,
    compute_type: str,
    language: str,
    batch_size: int,
    output_format: str,
    diarize: bool,
    hf_token: str,
    min_speakers: str,
    max_speakers: str,
) -> Iterator[tuple[str, str, list[str], str, float]]:
    if not audio_file:
        raise gr.Error("Choose an audio or video file first.")

    input_path = Path(audio_file)
    if not input_path.is_file():
        raise gr.Error("The selected file is no longer available.")

    started_at = time.monotonic()
    job_dir = Path(tempfile.mkdtemp(prefix="whisperx-webui-"))
    job_input = job_dir / input_path.name
    shutil.copy2(input_path, job_input)

    command = [
        sys.executable,
        "-u",
        "-m",
        "whisperx",
        str(job_input),
        "--model",
        model,
        "--device",
        device,
        "--compute_type",
        compute_type,
        "--batch_size",
        str(batch_size),
        "--output_dir",
        str(job_dir),
        "--output_format",
        output_format,
        "--verbose",
        "False",
    ]
    if language != "auto":
        command.extend(["--language", language])
    if diarize:
        command.append("--diarize")
        token = (hf_token or "").strip() or _load_hf_token()
        if token:
            _save_hf_token(token)
            command.extend(["--hf_token", token])
        parsed_min_speakers = _parse_speaker_count(min_speakers, "Min speakers")
        parsed_max_speakers = _parse_speaker_count(max_speakers, "Max speakers")
        if parsed_min_speakers is not None:
            command.extend(["--min_speakers", str(parsed_min_speakers)])
        if parsed_max_speakers is not None:
            command.extend(["--max_speakers", str(parsed_max_speakers)])

    environment = os.environ.copy()
    environment["PATH"] = _prepare_ffmpeg_path()
    log_lines = [
        f"requested_device={device}",
        f"requested_compute_type={compute_type}",
        "Initializing PyTorch CUDA diagnostics...",
    ]
    log = "\n".join(log_lines)
    yield f"Processing · {time.monotonic() - started_at:.1f}s", "", [], log, started_at

    diagnostics = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import torch; "
                "print('torch=' + torch.__version__); "
                "print('cuda_available=' + str(torch.cuda.is_available())); "
                "print('cuda_version=' + str(torch.version.cuda)); "
                "print('gpu_count=' + str(torch.cuda.device_count())); "
                "[print(f'gpu_{i}=' + torch.cuda.get_device_name(i)) "
                "for i in range(torch.cuda.device_count())]"
            ),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=environment,
    )
    redacted_command = list(command)
    if "--hf_token" in redacted_command:
        redacted_command[redacted_command.index("--hf_token") + 1] = "***"
    log_lines.extend([
        "--- PyTorch runtime ---",
        (diagnostics.stdout or diagnostics.stderr).strip(),
        "--- WhisperX command ---",
        " ".join(redacted_command),
        "--- WhisperX output ---",
    ])
    log = "\n".join(line for line in log_lines if line)
    yield f"Processing · {time.monotonic() - started_at:.1f}s", "", [], log, started_at

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        env=environment,
    )
    assert process.stdout is not None
    for line in process.stdout:
        log_lines.append(line.rstrip())
        log = "\n".join(line for line in log_lines if line)
        yield f"Processing · {time.monotonic() - started_at:.1f}s", "", [], log, started_at

    return_code = process.wait()
    if return_code != 0:
        details = "\n".join(log_lines[-30:]).strip()
        raise gr.Error(f"Transcription failed: {details[-2000:]}")

    text_path = job_dir / f"{input_path.stem}.txt"
    transcript = text_path.read_text(encoding="utf-8") if text_path.exists() else ""
    output_files = sorted(
        str(path)
        for path in job_dir.iterdir()
        if path.is_file() and path.name != input_path.name
    )
    yield f"Completed · {time.monotonic() - started_at:.1f}s", transcript, output_files, log, 0.0


def build_demo() -> gr.Blocks:
    with gr.Blocks(title="WhisperX Transcription Studio") as demo:
        gr.Markdown(
            """
            <div class="hero">
              <p class="hero-kicker">Local speech workspace</p>
              <h1>WhisperX Transcription Studio</h1>
              <p class="hero-subtitle">Turn recordings into clean, time-aligned transcripts with the model and hardware that fit your work.</p>
            </div>
            """
        )

        with gr.Row(elem_classes=["workspace-row"]):
            with gr.Column(scale=5, elem_id="source-section", elem_classes=["workspace-panel"]):
                gr.Markdown("<p id='source-section-label' class='section-label'>01 · Source</p>")
                audio_file = gr.File(
                    label="Audio or video file",
                    file_count="single",
                    file_types=["audio", "video"],
                    type="filepath",
                )
                change_file_button = gr.UploadButton(
                    "Change file",
                    file_count="single",
                    file_types=["audio", "video"],
                    type="filepath",
                    size="sm",
                )
                audio_preview = gr.Audio(
                    label="Audio preview",
                    type="filepath",
                    interactive=False,
                    elem_classes=["audio-drop"],
                )
                transcribe_button = gr.Button(
                    "Transcribe recording",
                    variant="primary",
                    interactive=False,
                    elem_classes=["run-button"],
                )
                status = gr.Textbox(
                    label="Run status",
                    value="Ready",
                    interactive=False,
                    visible=False,
                )

                audio_file.change(
                    _create_audio_preview,
                    inputs=audio_file,
                    outputs=[audio_preview, transcribe_button],
                )
                change_file_button.upload(
                    lambda path: path,
                    inputs=change_file_button,
                    outputs=audio_file,
                )
            with gr.Column(scale=4, elem_id="processing-section", elem_classes=["workspace-panel"]):
                gr.Markdown("<p id='processing-section-label' class='section-label'>02 · Processing</p>")
                model = gr.Dropdown(
                    MODEL_CHOICES,
                    value="large-v3",
                    label="Whisper model",
                    info="Larger models are more accurate but need more VRAM.",
                )
                with gr.Row():
                    device = gr.Dropdown(
                        ["cuda", "cpu"], value="cuda", label="Device"
                    )
                    compute_type = gr.Dropdown(
                        ["float16", "float32", "int8", "default"],
                        value="float16",
                        label="Compute type",
                    )
                with gr.Row():
                    language = gr.Dropdown(
                        ["auto", "en", "fr", "de", "es", "it", "pt", "ja", "zh"],
                        value="auto",
                        label="Language",
                    )
                    batch_size = gr.Slider(
                        minimum=1,
                        maximum=32,
                        value=8,
                        step=1,
                        label="Batch size",
                    )
                output_format = gr.Dropdown(
                    OUTPUT_FORMATS,
                    value="all",
                    label="Output format",
                )
                diarize = gr.Checkbox(
                    label="Enable speaker diarization",
                    value=False,
                    info="Requires a Hugging Face token and access to the pyannote diarization model.",
                )
                hf_token = gr.Textbox(
                    label="Hugging Face token",
                    placeholder="hf_... (required for diarization)",
                    type="password",
                    visible=False,
                    value=_load_hf_token,
                    info="Saved after the first run; leave as-is to reuse it.",
                )
                with gr.Row(visible=False) as speaker_options:
                    min_speakers = gr.Textbox(
                        label="Min speakers",
                        value="",
                        placeholder="Auto",
                        info="Leave blank to auto-detect.",
                    )
                    max_speakers = gr.Textbox(
                        label="Max speakers",
                        value="",
                        placeholder="Auto",
                        info="Leave blank to auto-detect.",
                    )

                diarize.change(
                    lambda enabled: (
                        gr.update(visible=enabled),
                        gr.update(visible=enabled),
                    ),
                    inputs=diarize,
                    outputs=[hf_token, speaker_options],
                )

        with gr.Column(elem_id="results-section", elem_classes=["results-panel"]):
            gr.Markdown("<p id='results-section-label' class='section-label'>03 · Results</p>")
            results_status = gr.Textbox(
                value="Ready",
                interactive=False,
                show_label=False,
                container=False,
                elem_classes=["status-box", "results-status-badge"],
            )
            with gr.Tabs():
                with gr.Tab("Transcript") as transcript_tab:
                    transcript = gr.Textbox(
                        label="Transcript preview",
                        lines=16,
                        placeholder="Your aligned transcript will appear here after processing.",
                        elem_classes=["transcript-preview"],
                    )
                with gr.Tab("Runtime log") as runtime_tab:
                    log_view = gr.Textbox(
                        label="Transcription log",
                        lines=16,
                        max_lines=24,
                        show_label=True,
                        interactive=False,
                        buttons=["copy"],
                        placeholder="CUDA and WhisperX runtime details will appear here after processing.",
                        elem_classes=["log-view"],
                    )
                with gr.Tab("Downloads") as downloads_tab:
                    with gr.Column(elem_classes=["download-panel"]):
                        downloads = gr.State([])
                        file_list = gr.Column(elem_classes=["file-list"])
                        file_preview_bridge = gr.Textbox(visible=False)

                        @gr.render(inputs=downloads)
                        def _render_file_list(file_paths: list[str]) -> None:
                            if not file_paths:
                                gr.Markdown(
                                    "_No files yet — run a transcription to generate output files._",
                                    elem_classes=["file-list-empty"],
                                )
                                return
                            for path in file_paths:
                                name = Path(path).name
                                with gr.Row(elem_classes=["file-row"]):
                                    gr.Markdown(name, elem_classes=["file-row-name"])
                                    view_button = gr.Button(
                                        "👁", size="sm", scale=0, elem_classes=["file-row-icon"]
                                    )
                                    view_button.click(
                                        _load_file_preview,
                                        inputs=gr.State(path),
                                        outputs=file_preview_bridge,
                                    ).then(
                                        fn=None,
                                        inputs=file_preview_bridge,
                                        js="""
                                        (content) => {
                                            const tab = window.open('', '_blank');
                                            if (!tab) { return; }
                                            tab.document.title = 'File preview';
                                            const pre = tab.document.createElement('pre');
                                            pre.style.whiteSpace = 'pre-wrap';
                                            pre.style.wordBreak = 'break-word';
                                            pre.style.fontFamily = 'monospace';
                                            pre.style.padding = '1rem';
                                            pre.textContent = content;
                                            tab.document.body.appendChild(pre);
                                        }
                                        """,
                                    )
                                    gr.DownloadButton(
                                        "⬇",
                                        value=path,
                                        size="sm",
                                        scale=0,
                                        elem_classes=["file-row-icon"],
                                    )

            scroll_to_results = """
            () => document.getElementById("results-section")?.scrollIntoView({ behavior: "smooth", block: "start" })
            """
            transcript_tab.select(js=scroll_to_results)
            runtime_tab.select(js=scroll_to_results)
            downloads_tab.select(js=scroll_to_results)

        timer_started = gr.State(0.0)
        elapsed_timer = gr.Timer(0.25)

        clear_run = transcribe_button.click(
            _clear_transcription_outputs,
            outputs=[status, transcript, downloads, log_view, timer_started],
            queue=False,
        )
        clear_run.then(
            transcribe_file,
            inputs=[
                audio_file,
                model,
                device,
                compute_type,
                language,
                batch_size,
                output_format,
                diarize,
                hf_token,
                min_speakers,
                max_speakers,
            ],
            outputs=[status, transcript, downloads, log_view, timer_started],
        )
        elapsed_timer.tick(
            _update_elapsed_status,
            inputs=[timer_started, status],
            outputs=status,
            show_progress="hidden",
        )
        status.change(lambda value: value, inputs=status, outputs=results_status, show_progress="hidden")
    return demo


def main() -> None:
    os.environ["PATH"] = _prepare_ffmpeg_path()
    build_demo().launch(
        theme=gr.themes.Soft(primary_hue="orange", secondary_hue="slate"),
        css=UI_CSS,
        footer_links=[],
        show_error=True,
        js="""
        () => {
            const targets = {
                "source-section-label": "source-section",
                "processing-section-label": "processing-section",
                "results-section-label": "results-section"
            };
            Object.entries(targets).forEach(([triggerId, targetId]) => {
                const trigger = document.getElementById(triggerId);
                const target = document.getElementById(targetId);
                if (trigger && target) {
                    trigger.onclick = () => target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });
        }
        """,
        server_port=3000,
    )


if __name__ == "__main__":
    main()