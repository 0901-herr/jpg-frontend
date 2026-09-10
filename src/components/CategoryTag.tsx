import { Tag } from 'antd'
import { formatCategoryLabel, getCategoryColor } from '../utils/classification'

interface CategoryTagProps {
  category?: string | null
}

export default function CategoryTag({ category }: CategoryTagProps) {
  return <Tag color={getCategoryColor(category)}>{formatCategoryLabel(category)}</Tag>
}
