FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    GRADIO_SERVER_NAME=0.0.0.0 \
    GRADIO_SERVER_PORT=3000 \
    HF_HOME=/cache/huggingface \
    # CTranslate2's wheel bundles cuDNN 9.1, which lacks working Blackwell
    # (RTX 50-series / sm_120) convolution kernels and fails transcription
    # with CUDNN_STATUS_INTERNAL_ERROR_UNEXPECTED_VALUE. Point the loader at
    # the newer cuDNN 9.10 that ships with torch's nvidia-cudnn-cu12 wheel
    # instead; it's backward compatible with older GPUs too.
    LD_LIBRARY_PATH=/app/.venv/lib/python3.10/site-packages/nvidia/cudnn/lib

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg git ca-certificates \
    && python3 -m pip install --no-cache-dir uv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml uv.lock README.md MANIFEST.in LICENSE ./

# Resolve dependencies first so editing whisperx/ does not re-download the
# CUDA-enabled torch stack. Cached across builds via the uv cache mount.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --extra webui --no-dev --no-install-project

COPY whisperx ./whisperx

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --extra webui --no-dev

EXPOSE 3000
VOLUME ["/cache/huggingface"]

CMD ["uv", "run", "--no-dev", "whisperx-webui"]
