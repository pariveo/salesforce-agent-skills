trigger AccountTrigger on Account (before insert, before update, after insert, after update) {
    if (Trigger.isBefore) {
        for (Account acc : Trigger.new) {
            acc.Description = (acc.Description == null ? '' : acc.Description) + (Trigger.isInsert ? '|TI' : '|TU');
        }
    } else {
        System.debug('AccountTrigger after ' + (Trigger.isInsert ? 'insert' : 'update') + ': Rating=' + Trigger.new[0].Rating + ' Type=' + Trigger.new[0].Type);
    }
}
