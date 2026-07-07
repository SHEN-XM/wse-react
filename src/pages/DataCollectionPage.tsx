import { CheckSquare, Loader2, Play, RefreshCw, Sparkles, Square, StopCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getReq, postReq } from "../utils/request";
import { notify } from "../utils/notify";

type RoomOption = {
  label: string;
  value: string;
};

const roomDicCode = "2007332305131016192";

function normalizeRoomOptions(data: unknown): RoomOption[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        label: String(record.label ?? record.name ?? record.nameZh ?? record.title ?? record.value ?? ""),
        value: String(record.value ?? record.id ?? record.code ?? "")
      };
    })
    .filter((item) => item.label && item.value);
}

function normalizeAliveRooms(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data.map((item) => String(item)).filter(Boolean);
}

export default function DataCollectionPage() {
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [aliveRooms, setAliveRooms] = useState<string[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingAlive, setLoadingAlive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [stoppingRoom, setStoppingRoom] = useState("");

  const roomNameMap = useMemo(() => new Map(rooms.map((room) => [room.value, room.label])), [rooms]);
  const roomName = useCallback((id: string) => roomNameMap.get(id) || "未知房间", [roomNameMap]);

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const resp = await getReq<RoomOption[]>(`/check/dic/option/zhen/${roomDicCode}`);
      if (resp.code === 0) setRooms(normalizeRoomOptions(resp.data));
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  const loadAliveRooms = useCallback(async () => {
    setLoadingAlive(true);
    try {
      const resp = await postReq<string[]>("/check/dy/danmu/list", {});
      if (resp.code === 0) setAliveRooms(normalizeAliveRooms(resp.data));
    } finally {
      setLoadingAlive(false);
    }
  }, []);

  const toggleRoom = (value: string) => {
    setSelectedRooms((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  };

  const startCollection = async () => {
    if (!selectedRooms.length) {
      notify({ type: "warning", title: "请选择直播间" });
      return;
    }
    setStarting(true);
    try {
      for (const roomId of selectedRooms) {
        const resp = await postReq("/check/dy/danmu", { id: roomId });
        if (resp.code === 0) {
          notify({ type: "success", title: "采集已启动", message: roomName(roomId) });
        } else {
          notify({ type: "error", title: "启动失败", message: `【${roomName(roomId)}】${resp.msg || "直播间未开播"}` });
        }
      }
      await loadAliveRooms();
    } finally {
      setStarting(false);
    }
  };

  const stopCollection = async (roomId: string) => {
    setStoppingRoom(roomId);
    try {
      const resp = await postReq("/check/dy/danmu/close", { id: roomId });
      if (resp.code === 0) {
        notify({ type: "success", title: "采集已停止", message: roomName(roomId) });
        await loadAliveRooms();
      }
    } finally {
      setStoppingRoom("");
    }
  };

  const cleanDanmu = async () => {
    setCleaning(true);
    try {
      const resp = await postReq("/check/dy/danmu/clean", []);
      if (resp.code === 0) {
        notify({ type: "success", title: "弹幕清洗已完成", message: "已过滤无效内容并写入分析索引" });
        await loadAliveRooms();
      }
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    void loadRooms();
    void loadAliveRooms();
  }, [loadAliveRooms, loadRooms]);

  return (
    <section className="workspace collection-workspace">
      <div className="module-header compact-module-header">
        <div>
          <p className="eyebrow">选择直播间并管理实时采集状态</p>
          <h2>数据采集</h2>
        </div>
        <div className="module-actions">
          <button type="button" onClick={loadAliveRooms} disabled={loadingAlive}>
            {loadingAlive ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            刷新状态
          </button>
          <button type="button" onClick={() => void cleanDanmu()} disabled={cleaning}>
            {cleaning ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            清洗弹幕
          </button>
          <button className="primary-button" type="button" onClick={startCollection} disabled={starting || loadingRooms}>
            {starting ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            采集
          </button>
        </div>
      </div>

      <section className="data-panel collection-panel">
        <div className="collection-section-title">
          <strong>直播间</strong>
          <span>{selectedRooms.length ? `已选择 ${selectedRooms.length} 个` : "请选择需要采集的直播间"}</span>
        </div>
        {loadingRooms ? (
          <div className="table-empty">
            <Loader2 className="spin" size={22} />
            正在加载直播间
          </div>
        ) : (
          <div className="room-option-grid">
            {rooms.map((room) => {
              const checked = selectedRooms.includes(room.value);
              return (
                <button className={`room-option ${checked ? "active" : ""}`} type="button" key={room.value} onClick={() => toggleRoom(room.value)}>
                  {checked ? <CheckSquare size={17} /> : <Square size={17} />}
                  <span>{room.label}</span>
                  <small>{room.value}</small>
                </button>
              );
            })}
            {!rooms.length && <div className="table-empty">暂无直播间配置</div>}
          </div>
        )}
      </section>

      <section className="data-panel collection-panel">
        <div className="collection-section-title">
          <strong>正在采集</strong>
          <span>{aliveRooms.length ? `${aliveRooms.length} 个直播间运行中` : "当前无采集任务"}</span>
        </div>
        <div className="alive-room-list">
          {aliveRooms.map((roomId) => (
            <div className="alive-room-card" key={roomId}>
              <div>
                <strong>{roomName(roomId)}</strong>
                <span>{roomId}</span>
              </div>
              <button type="button" onClick={() => stopCollection(roomId)} disabled={Boolean(stoppingRoom)}>
                {stoppingRoom === roomId ? <Loader2 className="spin" size={16} /> : <StopCircle size={16} />}
                停止采集
              </button>
            </div>
          ))}
          {!aliveRooms.length && <div className="table-empty">暂无正在采集的直播间</div>}
        </div>
      </section>
    </section>
  );
}
