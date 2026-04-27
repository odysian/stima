import type { LucideIcon, LucideProps } from "lucide-react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkPlus,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleCheck,
  Copy,
  Ellipsis,
  ExternalLink,
  FileText,
  FolderX,
  GripVertical,
  Inbox,
  Info,
  Link2Off,
  Mail,
  Mic,
  MicOff,
  Pencil,
  Play,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Square,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";

const materialToLucideMap: Record<string, LucideIcon> = {
  add: Plus,
  arrow_back: ArrowLeft,
  arrow_forward: ArrowRight,
  bookmark: Bookmark,
  bookmark_add: BookmarkPlus,
  business: Building2,
  cancel: XCircle,
  check: Check,
  check_circle: CircleCheck,
  chevron_right: ChevronRight,
  close: X,
  content_copy: Copy,
  delete: Trash2,
  description: FileText,
  drag_indicator: GripVertical,
  edit: Pencil,
  error: AlertCircle,
  expand_more: ChevronDown,
  expand_less: ChevronUp,
  folder_off: FolderX,
  group: Users,
  inbox_out: Inbox,
  info: Info,
  link_off: Link2Off,
  mail: Mail,
  mic: Mic,
  mic_off: MicOff,
  more_horiz: Ellipsis,
  open_in_new: ExternalLink,
  person_add: UserPlus,
  picture_as_pdf: FileText,
  play_arrow: Play,
  receipt_long: ReceiptText,
  search: Search,
  settings: Settings,
  stop: Square,
  warning: TriangleAlert,
};

export interface AppIconProps extends Omit<LucideProps, "ref"> {
  name: string;
}

export function AppIcon({ name, className, ...props }: AppIconProps): React.ReactElement {
  const Icon = materialToLucideMap[name] ?? Circle;
  return (
    <Icon
      aria-hidden="true"
      className={["inline-block h-[1em] w-[1em] shrink-0 align-middle", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
