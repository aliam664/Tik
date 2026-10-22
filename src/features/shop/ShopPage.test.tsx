import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/ui/Toast";
import { ShopPage } from "./ShopPage";

const listShopItems = vi.fn();
const getMyProfile = vi.fn();
const equipShopItem = vi.fn();
const purchaseItem = vi.fn();

vi.mock("@/lib/playerSession", () => ({
  playerIdentity: { token: () => "player-token" },
}));

vi.mock("@/games/registry", () => ({
  getActiveGames: () => [{ id: "doz", title: "دوز" }],
}));

vi.mock("@/lib/api", () => ({
  api: {
    listShopItems: (...args: unknown[]) => listShopItems(...args),
    getMyProfile: (...args: unknown[]) => getMyProfile(...args),
    equipShopItem: (...args: unknown[]) => equipShopItem(...args),
    purchaseItem: (...args: unknown[]) => purchaseItem(...args),
  },
}));

const item = {
  id: "item-1",
  sku: "title_strategist",
  name: "عنوان: استراتژیست",
  kind: "title",
  price: 250,
  rarity: "common",
};

function profile(equipped: boolean) {
  return {
    profile: { balance: 500 },
    inventory: [{ ...item, acquired_at: "2026-10-23T00:00:00Z", equipped }],
    equipped: equipped ? { title: item } : {},
    daily_gameplay: { earned: 0, cap: 150, remaining: 150, resets_at: "2026-10-24T00:00:00Z" },
    recent_matches: [],
    recent_ledger: [],
    achievements: [],
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ShopPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listShopItems.mockReset().mockResolvedValue([item]);
  getMyProfile.mockReset().mockResolvedValue(profile(false));
  equipShopItem.mockReset().mockResolvedValue({ ok: true, item });
  purchaseItem.mockReset();
});

describe("ShopPage cosmetic ownership", () => {
  it("offers equip instead of charging again, then renders the item as active", async () => {
    const user = userEvent.setup();
    getMyProfile.mockResolvedValueOnce(profile(false)).mockResolvedValueOnce(profile(true));
    renderPage();

    const equip = await screen.findByRole("button", { name: "تجهیز" });
    expect(screen.queryByRole("button", { name: "خرید" })).not.toBeInTheDocument();
    await user.click(equip);

    await waitFor(() => expect(equipShopItem).toHaveBeenCalledWith("player-token", "item-1"));
    expect(await screen.findByRole("button", { name: /فعال/ })).toBeDisabled();
    expect(purchaseItem).not.toHaveBeenCalled();
  });
});
