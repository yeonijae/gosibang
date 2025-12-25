import type { SurveyQuestion, SurveyAnswer } from '../../types';

interface QuestionRendererProps {
  question: SurveyQuestion;
  answer: SurveyAnswer | undefined;
  onChange: (answer: SurveyAnswer) => void;
}

export function QuestionRenderer({ question, answer, onChange }: QuestionRendererProps) {
  const handleChange = (value: string | string[] | number) => {
    onChange({ question_id: question.id, answer: value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <p className="text-lg font-medium text-gray-900">
          {question.question_text}
          {question.required && <span className="text-red-500 ml-1">*</span>}
        </p>
      </div>

      {question.question_type === 'text' && (
        <textarea
          value={(answer?.answer as string) || ''}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full p-4 border rounded-lg text-lg min-h-[120px] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          placeholder="답변을 입력해주세요"
        />
      )}

      {question.question_type === 'single_choice' && (
        <div className="space-y-3">
          {question.options?.map((option, index) => (
            <label
              key={index}
              className={`flex items-center gap-4 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                answer?.answer === option
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name={question.id}
                value={option}
                checked={answer?.answer === option}
                onChange={() => handleChange(option)}
                className="w-5 h-5 text-primary-600"
              />
              <span className="text-lg">{option}</span>
            </label>
          ))}
        </div>
      )}

      {question.question_type === 'multiple_choice' && (
        <div className="space-y-3">
          {question.options?.map((option, index) => {
            const selectedOptions = (answer?.answer as string[]) || [];
            const isChecked = selectedOptions.includes(option);

            return (
              <label
                key={index}
                className={`flex items-center gap-4 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  isChecked
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  value={option}
                  checked={isChecked}
                  onChange={() => {
                    const newSelection = isChecked
                      ? selectedOptions.filter((o) => o !== option)
                      : [...selectedOptions, option];
                    handleChange(newSelection);
                  }}
                  className="w-5 h-5 text-primary-600 rounded"
                />
                <span className="text-lg">{option}</span>
              </label>
            );
          })}
        </div>
      )}

      {question.question_type === 'scale' && question.scale_config && (
        <div className="space-y-4">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{question.scale_config.minLabel || question.scale_config.min}</span>
            <span>{question.scale_config.maxLabel || question.scale_config.max}</span>
          </div>
          <div className="flex justify-between gap-2">
            {Array.from(
              { length: question.scale_config.max - question.scale_config.min + 1 },
              (_, i) => question.scale_config!.min + i
            ).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => handleChange(value)}
                className={`flex-1 py-4 text-xl font-medium rounded-lg border-2 transition-colors ${
                  answer?.answer === value
                    ? 'border-primary-500 bg-primary-500 text-white'
                    : 'border-gray-300 hover:border-primary-300 hover:bg-primary-50'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestionRenderer;
