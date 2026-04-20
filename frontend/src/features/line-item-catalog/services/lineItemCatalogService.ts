import type {
  LineItemCatalogCreateRequest,
  LineItemCatalogItem,
  LineItemCatalogUpdateRequest,
} from "@/features/line-item-catalog/types/lineItemCatalog.types";
import { request } from "@/shared/lib/http";

interface LineItemCatalogApiItem {
  id: string;
  title: string;
  details: string | null;
  default_price: string | number | null;
  created_at: string;
  updated_at: string;
}

function parseDefaultPrice(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapItem(apiItem: LineItemCatalogApiItem): LineItemCatalogItem {
  return {
    id: apiItem.id,
    title: apiItem.title,
    details: apiItem.details,
    defaultPrice: parseDefaultPrice(apiItem.default_price),
    createdAt: apiItem.created_at,
    updatedAt: apiItem.updated_at,
  };
}

function listItems(): Promise<LineItemCatalogItem[]> {
  return request<LineItemCatalogApiItem[]>("/api/line-item-catalog").then((items) =>
    items.map(mapItem),
  );
}

function createItem(data: LineItemCatalogCreateRequest): Promise<LineItemCatalogItem> {
  return request<LineItemCatalogApiItem>("/api/line-item-catalog", {
    method: "POST",
    body: {
      title: data.title,
      details: data.details,
      default_price: data.defaultPrice,
    },
  }).then(mapItem);
}

function updateItem(id: string, data: LineItemCatalogUpdateRequest): Promise<LineItemCatalogItem> {
  const payload: {
    title?: string;
    details?: string | null;
    default_price?: number | null;
  } = {};

  if (data.title !== undefined) {
    payload.title = data.title;
  }
  if (data.details !== undefined) {
    payload.details = data.details;
  }
  if (data.defaultPrice !== undefined) {
    payload.default_price = data.defaultPrice;
  }

  return request<LineItemCatalogApiItem>(`/api/line-item-catalog/${id}`, {
    method: "PATCH",
    body: payload,
  }).then(mapItem);
}

function deleteItem(id: string): Promise<void> {
  return request<null>(`/api/line-item-catalog/${id}`, {
    method: "DELETE",
  }).then(() => undefined);
}

export const lineItemCatalogService = {
  listItems,
  createItem,
  updateItem,
  deleteItem,
};
