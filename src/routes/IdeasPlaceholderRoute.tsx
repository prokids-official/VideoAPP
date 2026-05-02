import { Button } from '../components/ui/Button';

export function IdeasPlaceholderRoute({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-bg px-8 text-text">
      <div className="max-w-[520px] text-center">
        <p className="mb-3 text-sm text-text-3">芝兰点子王</p>
        <h1 className="text-3xl font-bold tracking-tight">团队想法墙正在建设中</h1>
        <p className="mt-4 text-sm leading-7 text-text-2">
          P1.1 上线后，这里可以写、看、点赞大家的视频想法。现在先从主页保留入口。
        </p>
        <div className="mt-8">
          <Button variant="secondary" onClick={onBack}>
            回主页
          </Button>
        </div>
      </div>
    </div>
  );
}
