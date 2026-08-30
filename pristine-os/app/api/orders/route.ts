import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncGarmentTags } from "@/lib/garmentTags";

export async function GET() {
  try {
    const session =
      await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const orders =
      await prisma.order.findMany({
        where: {
          organizationId:
            session.user.organizationId,
        },
        include: {
          customer: true,
          garments: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

    return Response.json(orders);

  } catch (error) {
    console.error(
      "GET ORDERS ERROR:",
      error
    );

    return Response.json(
      {
        error:
          "Failed to load orders",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}


export async function POST(
  request: Request
) {
  try {
    const session =
      await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body =
      await request.json();

    if (
      !body.customerId
    ) {
      return Response.json(
        {
          error:
            "Customer is required",
        },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(body.garments) ||
      body.garments.length === 0
    ) {
      return Response.json(
        {
          error:
            "At least one garment is required",
        },
        { status: 400 }
      );
    }


    /*
     * Make sure the customer
     * belongs to this organization.
     */

    const customer =
      await prisma.customer.findFirst({
        where: {
          id: body.customerId,
          organizationId:
            session.user.organizationId,
        },
      });

    if (!customer) {
      return Response.json(
        {
          error:
            "Customer not found",
        },
        { status: 404 }
      );
    }


    /*
     * Clean and validate
     * garment information.
     */

    const garments =
      body.garments.map(
        (garment: any) => {

          const quantity =
            Number(
              garment.quantity
            ) || 1;

          const price =
            Number(
              garment.price
            ) || 0;

          return {
            name:
              String(
                garment.name ||
                  "Garment"
              ),

            quantity:
              Math.max(
                1,
                quantity
              ),

            service:
              String(
                garment.service ||
                  "Dry Clean"
              ),

            price:
              Math.max(
                0,
                price
              ),

            // Notation only — never participates in price/total math.
            prepayDiscount:
              garment.prepayDiscount === true,

            // Default-on: tags are eligible unless explicitly turned off.
            printTag:
              garment.printTag !== false,
          };
        }
      );

    // Order-level master switch — default-on, explicit opt-out.
    const tagPrintingEnabled = body.tagPrintingEnabled !== false;


    /*
     * Calculate the order
     * total.
     *
     * Example:
     *
     * Shirt
     * quantity = 2
     * price = $7
     *
     * 2 × $7 = $14
     */

    const total =
      garments.reduce(
        (
          sum: number,
          garment: {
            quantity: number;
            price: number;
          }
        ) =>
          sum +
          garment.quantity *
            garment.price,
        0
      );


    /*
     * Generate order number.
     */

    const orderNumber =
      `PR-${Date.now()}`;


    /*
     * Create the order, its garments, and one persistent GarmentTag
     * per physical unit of quantity — all inside one transaction so an
     * order can never exist without its tags (or vice versa).
     */

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          status: body.status || "RECEIVED",
          customerId: body.customerId,
          organizationId: session.user.organizationId,
          total,
          tagPrintingEnabled,
          garments: {
            create: garments,
          },
        },
        include: {
          garments: true,
        },
      });

      for (const garment of created.garments) {
        await syncGarmentTags(tx, {
          orderId: created.id,
          orderNumber: created.orderNumber,
          garmentId: garment.id,
          quantity: garment.quantity,
          currentTags: [],
        });
      }

      return tx.order.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          customer: true,
          garments: true,
        },
      });
    });


    console.log(
      "ORDER CREATED:",
      order
    );


    return Response.json(
      order,
      { status: 201 }
    );

  } catch (error) {

    console.error(
      "CREATE ORDER ERROR:",
      error
    );

    return Response.json(
      {
        error:
          "Failed to create order",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}