import JsonView from "react18-json-view";
import "react18-json-view/src/style.css";

type JsonViewerProps = {
  value: unknown;
  collapsed?: boolean | number;
};

export default function JsonViewer({ value, collapsed = false }: JsonViewerProps) {
  return (
    <div className="json-viewer">
      <JsonView
        src={value}
        dark={false}
        editable={false}
        collapsed={collapsed}
        displaySize
      />
    </div>
  );
}
