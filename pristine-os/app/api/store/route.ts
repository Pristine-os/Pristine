import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { can } from "@/lib/permissions";
import {
  STORE_DEFAULTS,
  validateStoreSettingsUpdate,
} from "@/lib/storeSettings";

const STORE_SELECT = {
  name: true,
  displayName: true,
  tagline: true,
  phone: true,
  email: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  region: true,
  postalCode: true,
  businessHours: true,
  receiptFooter: true,
  readyNotificationsEnabled: true,
} as const;

// Store profile for the signed-in user's organization. Any active staff
// member can read it (receipts need it); only Owners can change it.
export async function GET() {
  try {
    const auth = await requireUser();

    if (auth.error) {
      return auth.error;
    }

    const store = await prisma.organization.findUnique({
      where: { id: auth.user.organizationId },
      select: STORE_SELECT,
    });

    if (!store) {
      return Response.json({ error: "Store not found" }, { status: 404 });
    }

    return Response.json({
      ...store,
      defaults: STORE_DEFAULTS,
      canEdit: can(auth.user.role, "settings.store"),
    });
  } catch (error) {
    console.error("GET STORE SETTINGS ERROR:", error);

    return Response.json({ error: "Failed to load store settings" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireUser("settings.store");

    if (auth.error) {
      return auth.error;
    }

    const body = await request.json().catch(() => null);
    const validated = validateStoreSettingsUpdate(body);

    if ("error" in validated) {
      return Response.json({ error: validated.error }, { status: 400 });
    }

    // The organization is always the signed-in Owner's own — never taken
    // from the request.
    const store = await prisma.organization.update({
      where: { id: auth.user.organizationId },
      data: validated.data,
      select: STORE_SELECT,
    });

    return Response.json({ ...store, defaults: STORE_DEFAULTS, canEdit: true });
  } catch (error) {
    console.error("UPDATE STORE SETTINGS ERROR:", error);

    return Response.json({ error: "Failed to update store settings" }, { status: 500 });
  }
}
