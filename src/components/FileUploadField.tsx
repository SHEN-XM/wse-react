import { FileText, Upload, X } from "lucide-react";
import { useRef } from "react";

type FileUploadFieldProps = {
  accept?: string;
  disabled?: boolean;
  files: File[];
  label?: string;
  multiple?: boolean;
  note?: string;
  onChange: (files: File[]) => void;
};

export default function FileUploadField({ accept, disabled = false, files, label = "选择文件", multiple = false, note, onChange }: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
  const formatFileSize = (size: number) => {
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} B`;
  };
  const selectFiles = (selected: File[]) => {
    if (!multiple) {
      onChange(selected.slice(0, 1));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const merged = [...files];
    const keys = new Set(merged.map(fileKey));
    selected.forEach((file) => {
      const key = fileKey(file);
      if (!keys.has(key)) {
        keys.add(key);
        merged.push(file);
      }
    });
    onChange(merged);
    if (inputRef.current) inputRef.current.value = "";
  };
  const removeFile = (index: number) => {
    onChange(files.filter((_, fileIndex) => fileIndex !== index));
    if (inputRef.current) inputRef.current.value = "";
  };
  const clearFiles = () => {
    if (inputRef.current) inputRef.current.value = "";
    onChange([]);
  };

  return (
    <div className="file-upload-field">
      <input
        ref={inputRef}
        type="file"
        disabled={disabled}
        multiple={multiple}
        accept={accept}
        onChange={(event) => selectFiles(Array.from(event.target.files || []))}
      />
      <button className="file-upload-box" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <span className="file-upload-icon">
          <Upload size={17} />
        </span>
        <span className="file-upload-copy">
          <strong>{label}</strong>
          <small>{note || accept || "支持选择本地文件"}</small>
        </span>
      </button>
      {files.length ? (
        <div className="file-upload-list">
          <div className="file-upload-list-head">
            <span>{`已选择 ${files.length} 个文件`}</span>
            <button type="button" disabled={disabled} onClick={clearFiles}>清空</button>
          </div>
          <div className="file-upload-items">
            {files.map((file, index) => (
              <div className="file-upload-item" key={fileKey(file)}>
                <b>{index + 1}</b>
                <FileText size={15} />
                <span title={file.name}>{file.name}</span>
                <em>{formatFileSize(file.size)}</em>
                <button type="button" disabled={disabled} onClick={() => removeFile(index)} aria-label={`移除 ${file.name}`}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
