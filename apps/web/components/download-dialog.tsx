'use client';
import { useState } from 'react';
import { Download, FileImage, LoaderCircle, Package } from 'lucide-react';
import { api, type Asset } from '@/app/lib/api';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';

export function DownloadDialog({
  projectId,
  asset,
  disabled,
  label = '下载',
  variant = 'outline',
}: {
  projectId: string;
  asset?: Asset;
  disabled?: boolean;
  label?: string;
  variant?: 'outline' | 'ghost' | 'default';
}) {
  const [open, setOpen] = useState(false);
  const [formats, setFormats] = useState<string[]>(['png']);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: string; originalName: string }>();
  async function download() {
    setPending(true);
    setError('');
    setResult(undefined);
    try {
      const response = await api<{ asset: Asset }>(
        `/projects/${projectId}/exports`,
        {
          method: 'POST',
          body: JSON.stringify({
            formats,
            ...(asset ? { assetId: asset.id } : {}),
          }),
        },
      );
      setResult(response.asset);
      window.location.assign(`/api/assets/${response.asset.id}/download`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败，请重试');
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          disabled={disabled}
          className="download-trigger"
        >
          <Download size={16} />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="download-dialog">
        <div className="dialog-heading">
          <span className="dialog-emblem">
            {asset ? <FileImage /> : <Package />}
          </span>
          <DialogTitle>下载{asset ? '图片' : '整套图片'}</DialogTitle>
          <DialogDescription>
            {asset ? '导出当前查看的这张图片。' : '导出当前方案的完整套图。'}
            选择需要的格式，导出不消耗额度。
          </DialogDescription>
        </div>
        <div className="download-format-list">
          {(['png', 'jpg'] as const).map((format) => (
            <label
              key={format}
              className={
                formats.includes(format)
                  ? 'format-option selected'
                  : 'format-option'
              }
            >
              <Checkbox
                disabled={pending}
                checked={formats.includes(format)}
                onCheckedChange={(checked) => {
                  setResult(undefined);
                  setFormats((current) =>
                    checked === true
                      ? [...current, format]
                      : current.filter((item) => item !== format),
                  );
                }}
              />
              <FileImage size={24} />
              <span>
                <strong>{format.toUpperCase()}</strong>
                <small>
                  {format === 'png'
                    ? '无损画质，适合保存与继续设计'
                    : '文件更轻，适合上传至电商平台'}
                </small>
              </span>
            </label>
          ))}
        </div>
        <p className="dialog-help">
          {!asset || formats.length > 1
            ? '所选图片和格式将打包为一个 ZIP 文件。'
            : '单张单格式直接下载图片文件。'}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className="download-ready" role="status">
            文件已准备好。
            <a href={`/api/assets/${result.id}/download`}>
              点击下载 {result.originalName}
            </a>
          </p>
        )}
        <footer className="dialog-footer">
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            取消
          </Button>
          <Button disabled={pending || !formats.length} onClick={download}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Download />}
            {pending ? '正在准备文件…' : '确认下载'}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
