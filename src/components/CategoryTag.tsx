import { Tag } from 'antd'
import { formatCategoryLabel, getCategoryColor } from '../utils/classification'

interface CategoryTagProps {
  category?: string | null
  className?: string
}

export default function CategoryTag({ category, className }: CategoryTagProps) {
  const label = formatCategoryLabel(category)
  return (
    <Tag
      color={getCategoryColor(category)}
      title={label}
      className={`admin-category-tag${className ? ` ${className}` : ''}`}
    >
      <span className="admin-category-tag-label">{label}</span>
    </Tag>
  )
}
