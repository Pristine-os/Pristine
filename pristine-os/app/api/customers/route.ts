import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.organizationId) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();

  const customers = await prisma.customer.findMany({
    where: {
      organizationId: session.user.organizationId,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return Response.json(customers);
}


export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.organizationId) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json();

  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const phone = String(body.phone ?? "").trim();

  const emailInput =
    typeof body.email === "string" ? body.email.trim() : "";
  const email = emailInput === "" ? null : emailInput;

  if (!firstName || !lastName) {
    return Response.json(
      { error: "First and last name are required" },
      { status: 400 }
    );
  }

  if (!phone) {
    return Response.json(
      { error: "Phone number is required" },
      { status: 400 }
    );
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json(
      { error: "Enter a valid email address" },
      { status: 400 }
    );
  }

  const customer = await prisma.customer.create({
    data: {
      firstName,
      lastName,
      phone,
      email,
      organizationId: session.user.organizationId,
    },
  });

  return Response.json(customer);
}