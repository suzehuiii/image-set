'use client';

import { Search } from 'lucide-react';
import { Input } from './ui/input';
import { Select } from './ui/select';

export type TimeSort =
  'updated_desc' | 'updated_asc' | 'created_desc' | 'created_asc';

export function ListToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  searchLabel = '搜索项目',
  searchPlaceholder = '搜索项目名称…',
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sort: TimeSort;
  onSortChange: (value: TimeSort) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
}) {
  return (
    <div className="list-toolbar">
      <label className="project-search">
        <Search size={16} />
        <span className="visually-hidden">{searchLabel}</span>
        <Input
          placeholder={searchPlaceholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <label className="time-sort">
        <span className="visually-hidden">时间排序</span>
        <Select
          aria-label="时间排序"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as TimeSort)}
        >
          <option value="updated_desc">最近更新</option>
          <option value="updated_asc">最早更新</option>
          <option value="created_desc">最近创建</option>
          <option value="created_asc">最早创建</option>
        </Select>
      </label>
    </div>
  );
}
