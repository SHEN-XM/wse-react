import {
  Bot,
  CalendarDays,
  Database,
  FileText,
  Flame,
  Grid3X3,
  KeyRound,
  LibraryBig,
  ListChecks,
  Logs,
  MessageCircle,
  MessageSquareText,
  Network,
  ShieldCheck,
  Sparkles,
  SquareLibrary,
  User,
  UsersRound,
  Waypoints
} from "lucide-react";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

export type FieldOption = {
  label: string;
  value: string | number | boolean;
};

export type EnumValue = string | { label: string; color?: string };

export type TableColumn = {
  key: string;
  title: string;
  width?: number;
  type?: "text" | "date" | "enum" | "switch" | "json";
  enumMap?: Record<string, EnumValue>;
  switchApi?: string;
  switchPayload?: (checked: boolean, row: Record<string, unknown>) => Record<string, unknown>;
};

export type FormField = {
  key: string;
  label: string;
  type?: "input" | "textarea" | "number" | "select" | "switch";
  layout?: "half" | "wide";
  required?: boolean;
  rows?: number;
  options?: FieldOption[];
};

export type SearchField = {
  key: string;
  placeholder: string;
  type?: "input" | "select" | "switch";
  options?: FieldOption[];
};

export type ToolbarAction = {
  label: string;
  api: string;
  method?: "get" | "post";
  confirm?: string;
};

export type ImportAction = {
  label: string;
  api: string;
  accept?: string;
  fields?: FormField[];
};

export type MenuLeaf = {
  key: string;
  label: string;
  icon: ComponentType<LucideProps>;
  description: string;
  path: string;
  columns?: TableColumn[];
  formFields?: FormField[];
  searchFields?: SearchField[];
  actions?: ToolbarAction[];
  imports?: ImportAction[];
  hideOverview?: boolean;
  api?: {
    page?: string;
    add?: string;
    update?: string;
    delete?: string;
    gen?: string;
  };
  searchPlaceholder?: string;
};

export type MenuGroup = {
  key: string;
  label: string;
  icon: ComponentType<LucideProps>;
  children: MenuLeaf[];
};

const normalStatusEnum: Record<string, EnumValue> = {
  "0": { label: "正常", color: "green" },
  "1": "撤回",
  "2": "删除",
  "3": { label: "屏蔽", color: "red" }
};

const processStatusEnum: Record<string, EnumValue> = {
  "0": { label: "已处理", color: "green" },
  "1": "未处理",
  "2": { label: "处理失败", color: "red" }
};

const accountStatusOptions: FieldOption[] = [
  { label: "待审核", value: 1 },
  { label: "通过", value: 2 },
  { label: "驳回", value: 3 },
  { label: "已邀请", value: 4 },
  { label: "取消", value: 5 }
];

const userTypeOptions: FieldOption[] = [
  { label: "普通用户", value: 1 },
  { label: "创作者", value: 2 },
  { label: "管理员", value: 3 }
];

const promptTypeOptions: FieldOption[] = [
  { label: "日报去重", value: 1 },
  { label: "日报摘要", value: 2 },
  { label: "原数据处理", value: 3 },
  { label: "设定规划", value: 11 },
  { label: "设定生成", value: 12 },
  { label: "总纲生成", value: 13 },
  { label: "章纲生成", value: 14 },
  { label: "剧情生成", value: 15 },
  { label: "正文生成", value: 16 },
  { label: "世界理解规划", value: 21 },
  { label: "世界地图规划", value: 22 },
  { label: "世界地图展开", value: 23 },
  { label: "地图人物规划", value: 24 },
  { label: "组织人物扩展", value: 25 },
  { label: "组织节点优化", value: 26 },
  { label: "组织人物优化", value: 27 },
  { label: "单角色生成", value: 28 }
];

const promptTypeEnum = Object.fromEntries(promptTypeOptions.map((item) => [String(item.value), item.label]));

const aiTextStatusEnum: Record<string, EnumValue> = {
  "0": "待执行",
  "1": { label: "执行中", color: "blue" },
  "2": { label: "完成", color: "green" },
  "3": { label: "失败", color: "red" },
  "4": "已撤回"
};

const aiTextTypeEnum: Record<string, EnumValue> = {
  ai: { label: "AI文", color: "red" },
  human: { label: "人工文", color: "green" },
  "1": { label: "AI文", color: "red" },
  "2": { label: "人工文", color: "green" }
};

export const menuGroups: MenuGroup[] = [
  {
    key: "daily",
    label: "日报管理",
    icon: CalendarDays,
    children: [
      {
        key: "daily-hot",
        label: "每日热点",
        icon: Flame,
        path: "/",
        description: "生成、预览和管理每日小说热点日报。",
        api: { page: "/check/report/page", gen: "/check/report/gen", delete: "/check/report/delete" },
        searchPlaceholder: "搜索日报内容"
      }
    ]
  },
  {
    key: "world",
    label: "世界喊话",
    icon: MessageCircle,
    children: [
      {
        key: "chat",
        label: "聊天管理",
        icon: MessageSquareText,
        path: "/talk-manage",
        description: "管理用户对话、世界设定问答与模型会话记录。",
        hideOverview: true,
        columns: [
          { key: "username", title: "账号" },
          { key: "raw", title: "原内容" },
          { key: "content", title: "内容" },
          { key: "status", title: "状态", type: "enum", enumMap: normalStatusEnum },
          { key: "createTime", title: "创建时间", type: "date" }
        ],
        formFields: [{ key: "content", label: "内容", type: "textarea", rows: 18 }],
        searchFields: [{ key: "content", placeholder: "请输入内容" }],
        api: { page: "/check/world/talk/page", add: "/check/data/original/data/add", update: "/check/report/update", delete: "/check/report/delete" }
      }
    ]
  },
  {
    key: "review",
    label: "审批管理",
    icon: ListChecks,
    children: [
      {
        key: "account-apply",
        label: "账号申请",
        icon: User,
        path: "/apply-account",
        description: "处理用户注册、创作者申请与账号开通流程。",
        hideOverview: true,
        columns: [
          { key: "email", title: "邮箱" },
          { key: "reason", title: "申请理由" },
          { key: "reviewRemark", title: "审核备注", width: 100},
          { key: "applyIp", title: "申请 IP" },
          { key: "reviewTime", title: "审核时间", width: 220, type: "date" },
          { key: "createTime", title: "创建时间", width: 220, type: "date" }
        ],
        formFields: [
          { key: "email", label: "邮箱" },
          { key: "userType", label: "用户类型", type: "select", options: userTypeOptions, required: false },
          { key: "reason", label: "申请理由", type: "textarea", rows: 4, required: false },
          { key: "applyIp", label: "申请 IP", required: false },
          { key: "status", label: "申请状态", type: "select", options: accountStatusOptions, required: false },
          { key: "reviewRemark", label: "审核备注", type: "textarea", rows: 3, required: false }
        ],
        searchFields: [
          { key: "email", placeholder: "请输入邮箱" },
          { key: "userType", placeholder: "用户类型", type: "select", options: userTypeOptions },
          { key: "status", placeholder: "申请状态", type: "select", options: accountStatusOptions }
        ],
        api: { page: "/check/account/apply/page", add: "/check/account/apply/add", update: "/check/account/apply/update", delete: "/check/account/apply/delete" }
      }
    ]
  },
  {
    key: "data",
    label: "数据管理",
    icon: Database,
    children: [
      {
        key: "collection",
        label: "数据采集",
        icon: FileText,
        path: "/data",
        description: "选择直播间并管理实时采集状态。",
        hideOverview: true
      },
      {
        key: "hot-words",
        label: "热度词汇",
        icon: Flame,
        path: "/hot",
        description: "维护热门词、提示词和内容趋势标签。",
        columns: [
          { key: "name", title: "词汇" },
          { key: "value", title: "热度" },
          { key: "type", title: "类型", type: "enum", enumMap: { "1": "整句", "2": "单词" } }
        ],
        searchFields: [
          { key: "num", placeholder: "数量" },
          { key: "type", placeholder: "类型", type: "select", options: [{ label: "整句", value: 1 }, { label: "单词", value: 2 }] }
        ],
        api: { page: "/check/dy/danmu/hot" }
      },
      {
        key: "prompt",
        label: "提示词",
        icon: SquareLibrary,
        path: "/prompt",
        description: "管理业务提示词、模型模板与版本状态。",
        hideOverview: true,
        columns: [
          { key: "type", title: "类型", type: "enum", enumMap: promptTypeEnum },
          { key: "label", title: "标签" },
          { key: "system", title: "系统提示词" },
          { key: "user", title: "用户提示词" },
          { key: "pub", title: "私有", type: "enum", enumMap: { "1": { label: "公开", color: "green" }, "2": "私有" } },
          { key: "orderNum", title: "排序" },
          { key: "version", title: "版本" },
          {
            key: "active",
            title: "激活",
            width: 100,
            type: "switch",
            switchApi: "/check/prompt/active",
            switchPayload: (checked, row) => ({
              presetId: row.id,
              type: row.type,
              active: checked ? 1 : 0
            })
          },
          { key: "createTime", title: "创建时间", type: "date" }
        ],
        formFields: [
          { key: "type", label: "类型", type: "select", options: promptTypeOptions },
          { key: "label", label: "标签", required: false },
          { key: "system", label: "系统提示词", type: "textarea", rows: 18, layout: "half" },
          { key: "user", label: "用户提示词", type: "textarea", rows: 18, layout: "half" }
        ],
        searchFields: [
          { key: "type", placeholder: "请选择类型", type: "select", options: promptTypeOptions },
          { key: "label", placeholder: "请输入标签" },
          { key: "pub", placeholder: "私有/公开", type: "select", options: [{ label: "公开", value: 1 }, { label: "私有", value: 2 }] }
        ],
        api: { page: "/check/prompt/page", add: "/check/prompt/add", update: "/check/prompt/update", delete: "/check/prompt/delete" }
      },
      {
        key: "ai-text",
        label: "文本分析",
        icon: Bot,
        path: "/ai-text",
        description: "执行文本分析、检测基准和分析指标任务。",
        columns: [
          { key: "id", title: "任务ID" },
          { key: "taskCode", title: "任务编号" },
          { key: "fileName", title: "文件" },
          { key: "splitType", title: "分块类型" },
          { key: "chunkCount", title: "分块" },
          { key: "sourceType", title: "类型", type: "enum", enumMap: aiTextTypeEnum },
          { key: "status", title: "状态", type: "enum", enumMap: aiTextStatusEnum },
          { key: "progress", title: "进度" },
          { key: "targetCharCount", title: "兜底字数" },
          { key: "totalChars", title: "字数" },
          { key: "createTime", title: "创建时间", type: "date" },
          { key: "updateTime", title: "更新时间", type: "date" }
        ],
        searchFields: [
          { key: "fileName", placeholder: "搜索文件名" },
          { key: "status", placeholder: "状态", type: "select", options: Object.entries(aiTextStatusEnum).map(([value, item]) => ({ value, label: typeof item === "string" ? item : item.label })) }
        ],
        actions: [
          { label: "一键执行", api: "/check/aitext/task/execute/all" },
          { label: "一键撤回", api: "/check/aitext/task/rollback/all", confirm: "确认撤回所有可撤回任务？" },
          { label: "重建检测基准", api: "/check/aitext/baseline/rebuild", confirm: "确认重建 AI 检测基准？" }
        ],
        imports: [{ label: "上传文档采集", api: "/check/aitext/task/create", accept: ".txt,.doc,.docx", fields: [{ key: "sourceType", label: "文本类型", type: "select", options: [{ label: "AI文", value: "ai" }, { label: "人工文", value: "human" }] }] }],
        api: { page: "/check/aitext/task/page", delete: "/check/aitext/task/delete" }
      },
      {
        key: "data-source",
        label: "数据源",
        icon: Waypoints,
        path: "/novel-data",
        description: "配置接口、对象存储、搜索与外部数据源。",
        columns: [
          { key: "novel", title: "小说名" },
          { key: "content", title: "内容" },
          { key: "result", title: "处理结果" },
          { key: "status", title: "状态", type: "enum", enumMap: processStatusEnum },
          { key: "createTime", title: "创建时间", type: "date" }
        ],
        formFields: [
          { key: "novel", label: "小说名", required: false },
          { key: "content", label: "内容", type: "textarea", rows: 18 }
        ],
        searchFields: [{ key: "content", placeholder: "请输入内容" }],
        imports: [{ label: "TXT导入", api: "/check/data/original/data/import/txt", accept: ".txt", fields: [{ key: "title", label: "小说名称" }] }],
        actions: [{ label: "生成向量源", api: "/check/data/original/data/handle" }],
        api: { page: "/check/data/original/data/page", add: "/check/data/original/data/add", update: "/check/data/original/data/update", delete: "/check/data/original/data/delete" }
      },
      {
        key: "vector-source",
        label: "向量源",
        icon: Network,
        path: "/novel-vector",
        description: "管理向量库、知识索引和检索源。",
        columns: [
          { key: "dimension", title: "分类" },
          { key: "subDimension", title: "小类" },
          { key: "mechanism", title: "核心机制" },
          { key: "triggerCondition", title: "触发" },
          { key: "expressionPattern", title: "表达" },
          { key: "evidence", title: "证据" },
          { key: "cognitiveBasis", title: "解释" },
          { key: "score", title: "评分" },
          { key: "sourceTextName", title: "小说名" },
          { key: "sourceChunk", title: "原始段落" },
          { key: "status", title: "状态", type: "enum", enumMap: processStatusEnum },
          { key: "createTime", title: "创建时间", type: "date" }
        ],
        formFields: [
          { key: "sourceTextName", label: "小说名", required: false },
          { key: "sourceChunk", label: "原始段落", type: "textarea", rows: 18 }
        ],
        searchFields: [
          { key: "content", placeholder: "请输入内容" },
          { key: "status", placeholder: "请选择状态", type: "select", options: [{ label: "已处理", value: 0 }, { label: "未处理", value: 1 }, { label: "处理失败", value: 2 }] }
        ],
        actions: [{ label: "AI规则生成", api: "/check/data/novel/vector/handle" }],
        api: { page: "/check/data/novel/vector/page", add: "/check/data/novel/vector/add", update: "/check/data/novel/vector/update", delete: "/check/data/novel/vector/delete" }
      }
    ]
  },
  {
    key: "organization",
    label: "组织管理",
    icon: Grid3X3,
    children: [
      {
        key: "dictionary",
        label: "字典管理",
        icon: LibraryBig,
        path: "/dic",
        description: "维护业务字典、枚举值和全局配置项。",
        columns: [
          { key: "nameZh", title: "中文名" },
          { key: "nameEn", title: "英文名" },
          { key: "value", title: "值" },
          { key: "code", title: "标识" },
          { key: "description", title: "描述" }
        ],
        formFields: [
          { key: "nameZh", label: "中文名" },
          { key: "nameEn", label: "英文名" },
          { key: "value", label: "值", required: false },
          { key: "code", label: "标识" },
          { key: "description", label: "描述", type: "textarea", rows: 3, required: false }
        ],
        searchFields: [{ key: "nameZh", placeholder: "搜索字典" }],
        api: { page: "/check/dic/list", add: "/check/dic/add", update: "/check/dic/update", delete: "/check/dic/delete" }
      },
      {
        key: "permission",
        label: "权限管理",
        icon: ShieldCheck,
        path: "/menus",
        description: "管理菜单权限、接口权限与角色授权。",
        columns: [
          { key: "title", title: "菜单名称" },
          { key: "icon", title: "图标" },
          { key: "path", title: "路径" },
          { key: "method", title: "请求方式" },
          { key: "type", title: "类型" },
          { key: "orderNum", title: "排序" },
          { key: "permissionCode", title: "资源标识" },
          { key: "menuCode", title: "按钮标识" },
          { key: "name", title: "路由Name" },
          { key: "createTime", title: "创建时间", type: "date" }
        ],
        formFields: [
          { key: "title", label: "菜单名称" },
          { key: "path", label: "路径", required: false },
          { key: "method", label: "请求方式", required: false },
          { key: "type", label: "类型", type: "number", required: false },
          { key: "orderNum", label: "排序", type: "number", required: false },
          { key: "permissionCode", label: "资源标识", required: false },
          { key: "menuCode", label: "按钮标识", required: false },
          { key: "name", label: "路由Name", required: false }
        ],
        searchFields: [{ key: "title", placeholder: "搜索菜单" }],
        api: { page: "/check/permit/page", add: "/check/permit/add", update: "/check/permit/update", delete: "/check/permit/delete" }
      },
      {
        key: "role",
        label: "角色管理",
        icon: KeyRound,
        path: "/roles",
        description: "配置角色、资源范围和默认能力。",
        columns: [
          { key: "name", title: "角色名称" },
          { key: "description", title: "描述" },
          { key: "status", title: "状态", type: "enum", enumMap: { "1": { label: "启用", color: "green" }, "2": "停用", true: "启用", false: "停用" } },
          { key: "createTime", title: "创建时间", type: "date" },
          { key: "updateTime", title: "更新时间", type: "date" }
        ],
        formFields: [
          { key: "name", label: "角色名称" },
          { key: "description", label: "描述", type: "textarea", rows: 3, required: false },
          { key: "status", label: "状态", type: "select", options: [{ label: "启用", value: 1 }, { label: "停用", value: 2 }], required: false }
        ],
        searchFields: [{ key: "name", placeholder: "搜索角色" }],
        api: { page: "/check/role/page", add: "/check/role/add", update: "/check/role/update", delete: "/check/role/delete" }
      },
      {
        key: "user",
        label: "用户管理",
        icon: UsersRound,
        path: "/user",
        description: "管理用户信息、状态、登录记录和运营备注。",
        columns: [
          { key: "username", title: "账号" },
          { key: "nickName", title: "昵称" },
          { key: "email", title: "邮箱" },
          { key: "phone", title: "手机号" },
          { key: "status", title: "状态", type: "enum", enumMap: { "1": { label: "正常", color: "green" }, "2": { label: "封禁", color: "red" }, true: "正常", false: "封禁" } },
          { key: "createTime", title: "创建时间", type: "date" },
          { key: "updateTime", title: "更新时间", type: "date" }
        ],
        formFields: [
          { key: "username", label: "账号" },
          { key: "password", label: "密码", required: false },
          { key: "nickName", label: "昵称", required: false },
          { key: "realName", label: "真实姓名", required: false },
          { key: "email", label: "邮箱", required: false },
          { key: "phone", label: "手机号", required: false },
          { key: "status", label: "状态", type: "select", options: [{ label: "正常", value: 1 }, { label: "封禁", value: 2 }], required: false }
        ],
        searchFields: [
          { key: "username", placeholder: "搜索账号" },
          { key: "nickName", placeholder: "搜索昵称" }
        ],
        api: { page: "/check/user/page", add: "/check/user/add", update: "/check/user/update", delete: "/check/user/delete" }
      }
    ]
  },
  {
    key: "system",
    label: "系统管理",
    icon: Sparkles,
    children: [
      {
        key: "logs",
        label: "日志管理",
        icon: Logs,
        path: "/logs",
        description: "查看服务日志、操作日志与异常追踪。",
        columns: [
          { key: "username", title: "用户名" },
          { key: "method", title: "请求方法" },
          { key: "params", title: "请求参数" },
          { key: "execption", title: "异常信息" },
          { key: "time", title: "响应时间" },
          { key: "ip", title: "IP地址" },
          { key: "createTime", title: "创建时间", type: "date" }
        ],
        searchFields: [
          { key: "username", placeholder: "搜索用户名" },
          { key: "execption", placeholder: "搜索异常信息" }
        ],
        api: { page: "/check/log/page" }
      },
      {
        key: "files",
        label: "文件管理",
        icon: FileText,
        path: "/file",
        description: "按后端文件上传业务上传普通文件和视频文件。",
        hideOverview: true
      }
    ]
  }
];

export const menuLeaves = menuGroups.flatMap((group) => group.children);
