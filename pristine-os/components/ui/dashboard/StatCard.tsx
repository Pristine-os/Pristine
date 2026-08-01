import { Card, CardContent } from "@/components/ui/card";

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
};

export default function StatCard({
  title,
  value,
  subtitle,
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm text-gray-500">{title}</p>

        <h2 className="mt-2 text-3xl font-bold">
          {value}
        </h2>

        {subtitle && (
          <p className="mt-2 text-sm text-gray-400">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}