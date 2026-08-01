import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});


async function main() {

  const organization =
    await prisma.organization.findFirst();


  if (!organization) {
    throw new Error("Organization not found");
  }


  const password =
    await bcrypt.hash("password", 10);


  const user =
    await prisma.user.create({
      data: {
        name: "Pristine Owner",
        email: "owner@pristine.com",
        password,
        organizationId: organization.id,
      },
    });


  console.log(user);
}


main()
.finally(async()=>{
  await prisma.$disconnect();
});