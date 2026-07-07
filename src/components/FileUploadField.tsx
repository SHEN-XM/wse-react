import { FileText, Upload, X } from "lucide-react";
import { useRef } from "react";

type FileUploadFieldProps = {
  accept?: string;
  files: File[];
  label?: string;
  multiple?: boolean;
  note?: string;
  onChange: (files: File[]) => void;
};

export default function FileUploadField({ accept, files, label = "选择文件", multiple = false, note, onChange }: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const summary = files.length ? files.slice(0, 3).map((file) => file.name).join("、") + (files.length > 3 ? " 等" : "") : "未选择文件";
  const clearFiles = () => {
    if (inputRef.current) inputRef.current.value = "";
    onChange([]);
  };

  return (
    <div className="file-upload-field">
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={(event) => onChange(Array.from(event.target.files || []))}
      />
      {!files.length ? (
        <button className="file-upload-box" type="button" onClick={() => inputRef.current?.click()}>
          <span className="file-upload-icon">
            <Upload size={17} />
          </span>
          <span className="file-upload-copy">
            <strong>{label}</strong>
            <small>{note || accept || "支持选择本地文件"}</small>
          </span>
        </button>
      ) : (
        <div className="file-upload-summary">
          <FileText size={16} />
          <span>{`${files.length} 个文件：${summary}`}</span>
          <button type="button" onClick={clearFiles}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
