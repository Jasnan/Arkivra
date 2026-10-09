FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir 'glmocr[selfhosted,server]==0.1.5'
WORKDIR /app
COPY config.yaml /app/config.yaml
EXPOSE 5002
CMD ["python", "-m", "glmocr.server", "--config", "/app/config.yaml"]
