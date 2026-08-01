import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.organizationId) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const customers = await prisma.customer.findMany({
    where: {
      organizationId: session.user.organizationId,
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

  const customer = await prisma.customer.create({
    data: {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      email: body.email,
      organizationId: session.user.organizationId,
    },
  });

  return Response.json(customer);
}