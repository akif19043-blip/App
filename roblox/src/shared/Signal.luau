-- Küçük bir olay sınıfı (modüller birbirine doğrudan bağlanmasın diye).

local Signal = {}
Signal.__index = Signal

function Signal.new()
	return setmetatable({ handlers = {} }, Signal)
end

function Signal:Connect(fn)
	table.insert(self.handlers, fn)
	local handlers = self.handlers
	return {
		Disconnect = function()
			local index = table.find(handlers, fn)
			if index then
				table.remove(handlers, index)
			end
		end,
	}
end

function Signal:Fire(...)
	for _, fn in ipairs(table.clone(self.handlers)) do
		task.spawn(fn, ...)
	end
end

return Signal
