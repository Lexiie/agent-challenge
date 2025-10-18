"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UploadCardProps = {
  onSubmit: (payload: { file?: File; imageUrl?: string }) => void;
  isSubmitting?: boolean;
};

export default function UploadCard({ onSubmit, isSubmitting = false }: UploadCardProps) {
  const [file, setFile] = useState<File | undefined>();
  const [imageUrl, setImageUrl] = useState<string>("");
  const [isDragActive, setIsDragActive] = useState(false);

  const [filePreviewUrl, setFilePreviewUrl] = useState<string>("");

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setFilePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const previewUrl = useMemo(() => {
    if (file && filePreviewUrl) {
      return filePreviewUrl;
    }
    if (imageUrl.trim().length > 0) {
      return imageUrl.trim();
    }
    return "";
  }, [file, filePreviewUrl, imageUrl]);

  const resetPreview = useCallback(() => {
    setFile(undefined);
    setImageUrl("");
  }, []);

  const handleFileSelect = useCallback((selectedFile: File | undefined) => {
    if (!selectedFile) {
      setFile(undefined);
      return;
    }
    if (!selectedFile.type.startsWith("image/")) {
      console.warn("UploadCard: Only image files are allowed.");
      setFile(undefined);
      return;
    }
    setImageUrl("");
    setFile(selectedFile);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    onSubmit({
      file,
      imageUrl: imageUrl.trim().length > 0 ? imageUrl.trim() : undefined,
    });
  }, [file, imageUrl, onSubmit]);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-md">
      <form className="space-y-6" onSubmit={handleSubmit}>
        <header className="space-y-2 text-slate-200">
          <h2 className="text-xl font-semibold">Upload product label</h2>
          <p className="text-sm text-slate-400">
            Drop an image or paste a URL. Only one image is processed per analysis.
          </p>
        </header>

        <label
          htmlFor="label-upload"
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragActive(false);
          }}
          onDrop={handleDrop}
          className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
            isDragActive
              ? "border-sky-400 bg-sky-500/10"
              : "border-slate-700 bg-slate-900"
          }`}
        >
          <input
            id="label-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => handleFileSelect(event.target.files?.[0])}
          />
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-slate-300">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase">
              Drag & Drop
            </span>
            <p className="text-sm">
              or click to browse your files
            </p>
            {file && (
              <p className="text-xs text-slate-400">
                Selected: <strong className="font-medium text-slate-200">{file.name}</strong>
              </p>
            )}
          </div>
        </label>

        <div className="space-y-2">
          <label htmlFor="image-url" className="text-sm font-medium text-slate-300">
            Or analyze by image URL
          </label>
          <div className="flex gap-2">
            <input
              id="image-url"
              type="url"
              placeholder="https://example.com/label.jpg"
              className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              value={imageUrl}
              onChange={(event) => {
                setImageUrl(event.target.value);
                setFile(undefined);
              }}
            />
            {previewUrl && (
              <button
                type="button"
                onClick={resetPreview}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500 hover:text-slate-100"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {previewUrl && (
          <figure className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
            <img src={previewUrl} alt="Label preview" className="max-h-72 w-full object-contain" />
          </figure>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            disabled={isSubmitting || (!file && imageUrl.trim().length === 0)}
          >
            {isSubmitting ? "Analyzing…" : "Run LabelSimplified"}
          </button>
        </div>
      </form>
    </section>
  );
}
