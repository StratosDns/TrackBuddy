interface MacroBadgeProps {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  compact?: boolean;
}

export default function MacroBadge({ calories, protein, carbs, fats, compact }: MacroBadgeProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
          {calories} kcal
        </span>
        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
          P {protein}g
        </span>
        <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
          C {carbs}g
        </span>
        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
          F {fats}g
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-orange-50 rounded-lg p-3 text-center">
        <p className="text-lg font-bold text-orange-600">{calories}</p>
        <p className="text-xs text-gray-500 mt-0.5">Calories</p>
      </div>
      <div className="bg-blue-50 rounded-lg p-3 text-center">
        <p className="text-lg font-bold text-blue-600">{protein}g</p>
        <p className="text-xs text-gray-500 mt-0.5">Protein</p>
      </div>
      <div className="bg-yellow-50 rounded-lg p-3 text-center">
        <p className="text-lg font-bold text-yellow-600">{carbs}g</p>
        <p className="text-xs text-gray-500 mt-0.5">Carbs</p>
      </div>
      <div className="bg-red-50 rounded-lg p-3 text-center">
        <p className="text-lg font-bold text-red-600">{fats}g</p>
        <p className="text-xs text-gray-500 mt-0.5">Fats</p>
      </div>
    </div>
  );
}
