export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="text-center py-12">
      <h1 className="font-serif font-bold text-2xl text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-400">Coming soon</p>
    </div>
  );
}