'use client';
import * as SelectPrimitive from '@radix-ui/react-select';
import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

type SelectProps = Omit<
  ComponentProps<'select'>,
  'onChange' | 'value' | 'defaultValue'
> & {
  value?: string | number;
  defaultValue?: string;
  onChange?: (event: { target: { value: string } }) => void;
  children: ReactNode;
};
// One shared Radix select adapter preserves controlled values and native FormData names.
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  name,
  disabled,
  required,
  id,
  className,
  'aria-label': ariaLabel,
}: SelectProps) {
  const options = Children.toArray(children)
    .filter(isValidElement<ComponentProps<'option'>>)
    .map((child) => {
      const value = child.props.value ?? child.props.children;
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error(
          'Select options with complex labels require an explicit value',
        );
      }
      return {
        value: String(value),
        label: child.props.children,
        disabled: child.props.disabled,
      };
    });
  return (
    <SelectPrimitive.Root
      name={name}
      value={value === undefined ? undefined : String(value)}
      defaultValue={defaultValue ?? options[0]?.value}
      onValueChange={(next) => onChange?.({ target: { value: next } })}
      disabled={disabled}
      required={required}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={'ui-select-trigger ' + (className ?? '')}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="ui-select-content"
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll">
            <ChevronUp size={14} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="ui-select-item"
              >
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check size={15} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <ChevronDown size={14} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
